# safepath/utils/crime_scoring.py
import pandas as p

from .deepseek_client import rate_segment_risk
from .geometry_utils import haversine


def summarize_crime_for_segment(a, b, crime_df, radius=200):
    """Count crimes near this road segment."""
    lat1, lon1 = a
    lat2, lon2 = b

    mid = ((lat1 + lat2) / 2, (lon1 + lon2) / 2)

    subset = crime_df[
        crime_df.apply(
            lambda row: haversine(mid[0], mid[1], row["latitude"], row["longitude"])
            < radius,
            axis=1,
        )
    ]

    summary = {
        "total_crimes": len(subset),
        "crime_types": subset["crime_type"].value_counts().to_dict()
        if "crime_type" in subset
        else {},
        "average_severity": float(subset["severity"].mean())
        if len(subset) > 0
        else 0.0,
    }

    result = rate_segment_risk(summary)
    return result["risk"],result["explanation"]