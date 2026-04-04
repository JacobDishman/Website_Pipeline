#!/usr/bin/env python3
"""
Train the late-delivery prediction model and serialize it to jobs/model/.
Run from the project root:  python jobs/train.py

Connects to Supabase via REST API (SUPABASE_URL + SUPABASE_KEY env vars).
"""
import json
import os
import sys
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import StratifiedKFold, RandomizedSearchCV, train_test_split
from sklearn.pipeline import Pipeline

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_preparation import (
    ALL_FEATURES,
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    build_preprocessor,
    engineer_features,
    load_tables,
)

MODEL_DIR = Path(__file__).resolve().parent / "model"
TARGET = "late_delivery"


def main() -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY environment variables are required.", file=sys.stderr)
        return 1

    MODEL_DIR.mkdir(exist_ok=True)

    print("Loading data ...")
    tables = load_tables()  # Uses SUPABASE_URL/SUPABASE_KEY env vars
    df = engineer_features(tables)

    # Only rows with a known late_delivery label can be used for training
    labeled = df[df[TARGET].notna()].copy()
    labeled[TARGET] = labeled[TARGET].astype(int)
    print(f"  Labeled rows: {len(labeled)}  (late={labeled[TARGET].sum()}, on-time={(labeled[TARGET]==0).sum()})")

    X = labeled[ALL_FEATURES]
    y = labeled[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y,
    )

    preprocessor = build_preprocessor()

    base_pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(
            class_weight="balanced", random_state=42, n_jobs=-1,
        )),
    ])

    param_grid = {
        "classifier__n_estimators": [100, 200, 300, 400],
        "classifier__max_depth": [4, 6, 8, 10, None],
        "classifier__min_samples_split": [2, 5, 10],
        "classifier__min_samples_leaf": [1, 2, 4],
        "classifier__max_features": ["sqrt", "log2"],
    }

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    print("Tuning with RandomizedSearchCV (20 iterations) ...")
    search = RandomizedSearchCV(
        base_pipeline,
        param_distributions=param_grid,
        n_iter=20,
        scoring="recall",
        cv=cv,
        random_state=42,
        n_jobs=-1,
        verbose=1,
    )
    search.fit(X_train, y_train)

    best = search.best_estimator_
    print(f"\nBest CV recall: {search.best_score_:.4f}")
    print(f"Best params:    {search.best_params_}")

    y_pred = best.predict(X_test)
    y_prob = best.predict_proba(X_test)[:, 1]
    print("\n--- Test-set performance ---")
    print(classification_report(y_test, y_pred, target_names=["On-time", "Late"]))
    print(f"ROC-AUC: {roc_auc_score(y_test, y_prob):.4f}")

    # Refit on ALL labeled data before serializing
    best.fit(X, y)

    model_path = MODEL_DIR / "model.pkl"
    joblib.dump(best, model_path)
    print(f"\nModel saved to {model_path}  ({model_path.stat().st_size / 1024:.0f} KB)")

    feature_path = MODEL_DIR / "feature_columns.json"
    feature_path.write_text(json.dumps(ALL_FEATURES, indent=2))
    print(f"Feature list saved to {feature_path}")

    # Save model metadata (version, timestamp, row counts, feature list)
    from datetime import datetime
    model_version = "1.0.0"
    metadata = {
        "model_name": "late_delivery_pipeline",
        "model_version": model_version,
        "trained_at_utc": datetime.utcnow().isoformat(),
        "warehouse_table": "orders (via Supabase)",
        "num_training_rows": int(X_train.shape[0]),
        "num_test_rows": int(X_test.shape[0]),
        "num_total_labeled_rows": int(len(labeled)),
        "features": ALL_FEATURES,
        "target": TARGET,
    }
    metadata_path = MODEL_DIR / "model_metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to {metadata_path}")

    # Save evaluation metrics
    from sklearn.metrics import accuracy_score, f1_score, classification_report as cls_report
    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "f1": float(f1_score(y_test, y_pred)),
        "roc_auc": float(roc_auc_score(y_test, y_prob)),
        "classification_report": cls_report(y_test, y_pred, target_names=["On-time", "Late"], output_dict=True),
    }
    metrics_path = MODEL_DIR / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"Metrics saved to {metrics_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
