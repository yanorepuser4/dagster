from dagster import (
    DefaultSensorStatus,
    Definitions,
    SchedulingCondition,
    asset,
)
from dagster._core.definitions.auto_materialize_sensor_definition import (
    AssetAutomationSensorDefinition,
)

eager_policy = SchedulingCondition.eager_with_rate_limit().as_auto_materialize_policy()


@asset(auto_materialize_policy=eager_policy)
def upstream() -> None: ...


@asset(
    deps=[upstream],
    auto_materialize_policy=eager_policy,
)
def downstream() -> None: ...


amp_sensor = AssetAutomationSensorDefinition(
    "amp_sensor",
    asset_selection="*",
    default_status=DefaultSensorStatus.RUNNING,
)

defs = Definitions(
    assets=[upstream, downstream],
    sensors=[amp_sensor],
)
