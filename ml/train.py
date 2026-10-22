import argparse
from pathlib import Path
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from lightgbm import LGBMClassifier
from features import FEATURES
p=argparse.ArgumentParser();p.add_argument('--csv',required=True);p.add_argument('--target',required=True);p.add_argument('--output',default='models/safety_model.txt');a=p.parse_args()
df=pd.read_csv(a.csv);missing=set(FEATURES+[a.target])-set(df.columns)
if missing: raise SystemExit(f'Missing columns: {sorted(missing)}')
df=df[FEATURES+[a.target]].dropna();x1,x2,y1,y2=train_test_split(df[FEATURES],df[a.target],test_size=.2,random_state=42,stratify=df[a.target]);m=LGBMClassifier(n_estimators=200,class_weight='balanced',random_state=42);m.fit(x1,y1);print(classification_report(y2,m.predict(x2)));Path(a.output).parent.mkdir(parents=True,exist_ok=True);m.booster_.save_model(a.output);print('Saved model; validate locally before use.')
