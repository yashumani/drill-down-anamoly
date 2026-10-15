"""Public source identity evidence; never prints secrets or a PR token."""
import json
import os
import subprocess
actual=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
expected=os.environ['GITHUB_SHA']
assert actual==expected, 'Checkout differs from workflow source identity'
print(json.dumps({'event':os.environ['GITHUB_EVENT_NAME'],'checkout_sha':actual,'github_sha':expected},sort_keys=True))
