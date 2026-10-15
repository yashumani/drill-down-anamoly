"""Multi-Tier Reporting Assurance. No model, server or network required."""
from .contracts import ConfigError, bundle_digest, load_bundle, validate_bundle
from .engine import evaluate
from .adapters import read_csv
from .profiling import profile

__version__ = "0.1.0a1"
__all__ = ["ConfigError", "bundle_digest", "load_bundle", "validate_bundle", "evaluate", "read_csv", "profile"]

from .analysis import analyze
from .suggestions import suggest_rules
__all__ += ["analyze", "suggest_rules"]
