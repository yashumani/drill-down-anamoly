"""Deterministic draft proposals, never inferred business constraints."""
from .contracts import validate_bundle
from .profiling import profile
from .table import table


def suggest_rules(rows,*,revision='draft-v1'):
    """Propose explicit presence/type-review rules without embedding raw values.

    Observed categories, min/max and uniqueness do NOT become allowed-value,
    range or grain rules. All suggestions are optional, nonblocking drafts.
    Review and approve provenance/revision/digest through the caller's trust model.
    """
    table(rows)
    fields=sorted({f for row in rows for f in row})
    if not fields:return {'observed':profile(rows),'bundle':None,'reason':'empty_schema'}
    def rule(id,op,p):return {'id':id,'operator':op,'params':p,'severity':'info','required':False,'blocking':False,'depends_on':[]}
    rules=[rule('review_presence','required_fields',{'fields':fields})]
    proposed={}
    mapping={'str':'string','int':'integer','Decimal':'decimal','bool':'boolean','date':'date','datetime':'datetime'}
    for f in fields:
        kinds={type(row[f]).__name__ for row in rows if row.get(f) is not None}
        if len(kinds)==1:
            kind=next(iter(kinds));proposed[f]={'type':mapping[kind],'nullable':True}
    if proposed:rules.append(rule('review_types','types',{'fields':proposed}))
    config={'schema_version':'1.0','revision':revision,'provenance':{'author':'deterministic_suggestion_engine','source':'observed runtime types; owner review required','kind':'draft_proposal'},'rules':rules}
    validate_bundle(config)
    return {'observed':profile(rows),'bundle':config,'reason':'owner_review_required',
            'limitations':['observed_types_are_proposals','nullable_true_does_not_approve_missingness','no_business_bounds_or_keys_inferred']}
