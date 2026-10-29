import httpx
from datetime import datetime, timezone


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def get_weather(latitude: float, longitude: float) -> dict:
    """
    Fetch current weather and recent precipitation from Open-Meteo.

    No API key is required for the public endpoint.
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": (
            "temperature_2m,"
            "relative_humidity_2m,"
            "precipitation,"
            "rain,"
            "wind_speed_10m"
        ),
        "hourly": (
            "precipitation,"
            "rain"
        ),
        "past_days": 1,
        "forecast_days": 1,
        "timezone": "UTC",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            OPEN_METEO_URL,
            params=params,
        )
        response.raise_for_status()
        data = response.json()

    current = data.get("current", {})
    hourly = data.get("hourly", {})

    precipitation_values = hourly.get("precipitation", [])
    rain_values = hourly.get("rain", [])
    hourly_times = hourly.get("time", [])

    now_utc = datetime.now(timezone.utc)
    recent_precipitation = 0.0
    recent_rainfall = 0.0
    recent_hours = 0

    for index, timestamp in enumerate(hourly_times):
        try:
            observation_time = datetime.fromisoformat(
                timestamp.replace("Z", "+00:00")
            )

            if observation_time.tzinfo is None:
                observation_time = observation_time.replace(
                    tzinfo=timezone.utc
                )

            age_hours = (
                now_utc - observation_time.astimezone(timezone.utc)
            ).total_seconds() / 3600

            # Sum the previous six completed hourly periods.
            if 0 < age_hours <= 6:
                if index < len(precipitation_values):
                    recent_precipitation += (
                        float(precipitation_values[index] or 0)
                    )

                if index < len(rain_values):
                    recent_rainfall += float(
                        rain_values[index] or 0
                    )

                recent_hours += 1

        except (ValueError, TypeError):
            continue

    return {
        "source": "Open-Meteo",
        "latitude": latitude,
        "longitude": longitude,
        "observed_at": current.get("time"),
        "temperature_c": current.get("temperature_2m"),
        "relative_humidity_percent": current.get(
            "relative_humidity_2m"
        ),
        "precipitation_mm": current.get("precipitation"),
        "rain_mm": current.get("rain"),
        "wind_kmh": current.get("wind_speed_10m"),
        "recent_6h_precipitation_mm": round(
            recent_precipitation, 2
        ),
        "recent_6h_rain_mm": round(recent_rainfall, 2),
        "recent_hours_available": recent_hours,
        "weather_retrieved_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }