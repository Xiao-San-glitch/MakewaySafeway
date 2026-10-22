import argparse,json,pandas as pd
from lightgbm import Booster
from features import FEATURES
p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--json',required=True);a=p.parse_args();row=json.loads(a.json);m=Booster(model_file=a.model);print(json.dumps({'estimate':float(m.predict(pd.DataFrame([[row[k] for k in FEATURES]],columns=FEATURES))[0]),'warning':'Not a safety guarantee.'}))
