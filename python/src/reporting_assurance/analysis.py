"""Bounded Tier 2 calculations on explicitly selected and validated evidence.

Numeric outputs are opt-in aggregate evidence. No row text, automatic root-cause
claims, forecasts, learned anomaly thresholds or AI explanations are generated.
"""
from collections import defaultdict
from decimal import Decimal, localcontext
from .contracts import ConfigError, exact, require, names, name, number, scalar, _bounded_tree, ID
from .engine import evaluate
from .table import key, token, table, decimal, exact_sum, iso_date, math_context


def validate_analysis(spec, rule_ids):
    _bounded_tree(spec)
    exact(spec, ['analysis_version', 'analyses'])
    require(spec['analysis_version'] == '1.0', 'unsupported_analysis_version')
    require(type(spec['analyses']) is list and 0 < len(spec['analyses']) <= 32, 'analysis_limit')
    ids = set()
    for item in spec['analyses']:
        exact(item, ['id', 'operator', 'params', 'depends_on'])
        name(item['id']); require(bool(ID.fullmatch(item['id'])), 'invalid_analysis_id'); require(item['id'] not in ids, 'duplicate_analysis_id'); ids.add(item['id'])
        names(item['depends_on'])
        require(set(item['depends_on']) <= rule_ids, 'unknown_analysis_prerequisite')
        p=item['params']
        common=['measure_kind','group_by','semantic_fields','row_level','expected_periods']
        optional=['measure','baseline_measure','numerator','denominator','reported_field','tolerance','reference','actual_scenario','baseline_scenario','actual_snapshot','baseline_snapshot','calendar_reference','period_field']
        exact(p,common,optional)
        require(p['measure_kind'] in ('flow','balance'), 'invalid_measure_kind')
        names(p['group_by'],empty=True)
        exact(p['semantic_fields'],['period','scenario','currency','unit','scale','snapshot'])
        for f in p['semantic_fields'].values(): name(f)
        require(len(set(p['semantic_fields'].values())) == 6, 'semantic_fields_must_differ')
        exact(p['row_level'],['field','value']);name(p['row_level']['field']);scalar(p['row_level']['value'])
        require(p['row_level']['value'] is not None)
        names(p['expected_periods'])
        for field in ('measure','baseline_measure','denominator','reported_field','reference','calendar_reference','period_field'):
            if field in p:name(p[field])
        if 'tolerance' in p: require(number(p['tolerance'])>=0,'negative_tolerance')
        op=item['operator']
        require(op in ('ratio_of_sums','variance','summary','period_end'),'unknown_analysis_operator')
        allowed=set(common)
        if op=='ratio_of_sums':
            allowed.update(['numerator','denominator','reported_field','tolerance'])
            require(p['measure_kind']=='flow' and 'numerator' in p and 'denominator' in p,'ratio_components_required')
            exact(p['numerator'],['field'],['subtract_field'])
            for f in p['numerator'].values():name(f)
        elif op=='variance':
            allowed.update(['measure','baseline_measure','reference','actual_scenario','baseline_scenario','actual_snapshot','baseline_snapshot','calendar_reference'])
            require(p['measure_kind']=='flow' and all(k in p for k in allowed-set(common)),'variance_context_required')
            for k in ('actual_scenario','baseline_scenario','actual_snapshot','baseline_snapshot'):scalar(p[k]);require(p[k] is not None)
        elif op=='period_end':
            allowed.update(['measure','period_field'])
            require(p['measure_kind']=='balance' and p.get('period_field')==p['semantic_fields']['period'],'period_end_context_required')
        else:
            allowed.add('measure');require(p['measure_kind']=='flow','summary_requires_flow')
        require(p.keys() <= allowed,'unknown_analysis_parameter')
        if op!='ratio_of_sums':require('measure' in p,'measure_required')
    return spec


def unavailable(reason):return {'outcome':'not_evaluated','reason':reason,'groups':[]}


def selected(rows,p):
    s=p['row_level']
    if any(s['field'] not in r or r[s['field']] is None for r in rows):return None
    return [r for r in rows if token(r[s['field']])==token(s['value'])]


def contexts(records,p,baseline=False):
    sem=p['semantic_fields'];groups=defaultdict(list)
    if {r.get(sem['period']) for r in records} != set(p['expected_periods']):return False
    for r in records:groups[key(r,p['group_by'])].append(r)
    for records in groups.values():
        if sem['period'] not in p['group_by'] and {r.get(sem['period']) for r in records} != set(p['expected_periods']):return False
        fields=[v for k,v in sem.items() if k!='period']
        if len({key(r,fields) for r in records})!=1:return False
        if baseline:
            if any(token(r[sem['scenario']])!=token(p['baseline_scenario']) or token(r[sem['snapshot']])!=token(p['baseline_snapshot']) for r in records):return False
        elif 'actual_scenario' in p:
            if any(token(r[sem['scenario']])!=token(p['actual_scenario']) or token(r[sem['snapshot']])!=token(p['actual_snapshot']) for r in records):return False
    return bool(groups)


def calculate(op,p,rows,references):
    records=selected(rows,p)
    if not records:return unavailable('selected_level_unavailable')
    try:
        if not contexts(records,p):return unavailable('incompatible_or_incomplete_context')
        groups=defaultdict(list)
        for r in records:groups[key(r,p['group_by'])].append(r)
        if len(groups)>1000:return unavailable('analysis_group_limit')
        output=[];mismatch=0
        if op=='variance':
            baseline=references.get(p['reference'])
            if not baseline:return unavailable('baseline_missing')
            # Full-period comparison uses a caller-supplied close/completeness calendar.
            calendar=references.get(p['calendar_reference'])
            if not calendar:return unavailable('period_calendar_missing')
            period=p['semantic_fields']['period']
            calendar_by={}
            for r in calendar:
                if r.get(period) in calendar_by:return unavailable('period_calendar_ambiguous')
                calendar_by[r.get(period)]=r
            for v in p['expected_periods']:
                state=calendar_by.get(v)
                if not state or state.get('period_state')!='closed' or state.get('complete') is not True:
                    return unavailable('period_incomplete')
            if not contexts(baseline,p,baseline=True):return unavailable('baseline_missing_or_incompatible')
            control=defaultdict(list)
            for r in baseline:control[key(r,p['group_by'])].append(r)
            if groups.keys()!=control.keys():return unavailable('baseline_group_coverage_missing')
            for k in groups:
                common=[v for role,v in p['semantic_fields'].items() if role not in ('scenario','snapshot','period')]
                if {key(r,common) for r in groups[k]}!={key(r,common) for r in control[k]}:return unavailable('baseline_units_incompatible')
                # Baseline must have one independently declared value per comparison group and period.
                if len({key(r,[period]) for r in control[k]})!=len(control[k]):return unavailable('baseline_duplicate_grain')
            for i,k in enumerate(sorted(groups,key=repr)):
                actual=exact_sum(decimal(r.get(p['measure'])) for r in groups[k])
                base=exact_sum(decimal(r.get(p['baseline_measure'])) for r in control[k])
                with math_context() as ctx:
                    ctx.prec=320;delta=actual-base
                    ctx.prec=34;fraction=None if base==0 else str(delta/abs(base))
                output.append({'group_index':i,'actual':str(actual),'baseline':str(base),'delta':str(delta),
                               'relative_delta':fraction,'relative_outcome':'not_evaluated' if base==0 else 'pass',
                               'relative_reason':'zero_baseline' if base==0 else 'absolute_baseline_denominator'})
        else:
            for i,k in enumerate(sorted(groups,key=repr)):
                data=groups[k]
                if op=='ratio_of_sums':
                    n=p['numerator'];positive=exact_sum(decimal(r.get(n['field'])) for r in data)
                    minus=exact_sum(decimal(r.get(n['subtract_field'])) for r in data) if 'subtract_field' in n else Decimal(0)
                    denominator=exact_sum(decimal(r.get(p['denominator'])) for r in data)
                    if denominator==0:return unavailable('zero_denominator')
                    if denominator<0:return unavailable('negative_denominator_requires_domain_policy')
                    with math_context() as ctx:
                        ctx.prec=320;numerator=positive-minus
                        ctx.prec=34;ratio=numerator/denominator
                    if 'reported_field' in p:
                        if len(data)!=1:return unavailable('reported_ratio_requires_single_record_per_group')
                        reported=decimal(data[0].get(p['reported_field']))
                        with math_context() as ctx:
                            ctx.prec=320;mismatch+=abs(reported-ratio)>number(p.get('tolerance','0'))
                    output.append({'group_index':i,'numerator':str(numerator),'denominator':str(denominator),'ratio':str(ratio)})
                elif op=='period_end':
                    dates=[iso_date(r[p['period_field']]) for r in data];latest=max(dates)
                    endpoints=[r for r,d in zip(data,dates) if d==latest]
                    if len(endpoints)!=1:return unavailable('ambiguous_period_endpoint')
                    output.append({'group_index':i,'value':str(decimal(endpoints[0].get(p['measure']))),'selected_period':latest.isoformat()})
                else:
                    values=[decimal(r.get(p['measure'])) for r in data];total=exact_sum(values)
                    with math_context() as ctx:
                        ctx.prec=320;mean=total/len(values)
                        squared=exact_sum((v-mean)**2 for v in values)
                        ctx.prec=34;deviation=(squared/len(values)).sqrt();mean=total/len(values)
                    output.append({'group_index':i,'count':len(values),'total':str(total),'mean':str(mean),
                                   'minimum':str(min(values)),'maximum':str(max(values)),'population_stddev':str(deviation)})
        return {'outcome':'fail' if mismatch else 'pass','reason':'reported_ratio_mismatch' if mismatch else 'declared_calculation_evaluated',
                'groups':output,'mismatched_groups':int(mismatch)}
    except (ValueError,KeyError,TypeError):return unavailable('numeric_or_semantic_evidence_missing')
    except ArithmeticError:return {'outcome':'error','reason':'analysis_execution_error','groups':[]}


def analyze(rows,bundle,spec=None,*,evaluation_time=None,references=None,mode='preview',trusted_digests=()):
    """Re-evaluate Tier 1 on these exact inputs; skip only each analysis's own invalid prerequisites.

    Every analysis must name one or more Tier 1 prerequisites. Analyses never
    change the Tier 1 gate. Caller selects adequate grain, coverage, type and
    context checks. Preview calculations are descriptive, never production approval.
    """
    report=evaluate(rows,bundle,evaluation_time=evaluation_time,references=references,mode=mode,trusted_digests=trusted_digests)
    checks={r['id']:r['outcome'] for r in report['results']}
    if spec is None:spec=bundle.get('analysis')
    validate_analysis(spec,set(checks))
    results=[]
    for item in spec['analyses']:
        if any(checks[r]!='pass' for r in item['depends_on']):value=unavailable('prerequisite_not_passed')
        elif mode=='production' and not report['approval_valid_in_caller_trust']:value=unavailable('approved_rules_required')
        elif mode=='production' and spec!=bundle.get('analysis'):value=unavailable('analysis_spec_not_approved')
        else:value=calculate(item['operator'],item['params'],rows,references or {})
        value.update(id=item['id'],operator=item['operator']);results.append(value)
    return {'analysis_version':'1.0','tier1':report,'analyses':results,
            'limitations':['descriptive_association_is_not_causation','group_indices_do_not_expose_group_labels','caller_declares_prerequisite_scope']}
