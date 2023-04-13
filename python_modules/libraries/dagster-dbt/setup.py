from pathlib import Path
from typing import Dict

from setuptools import find_packages, setup


def get_version() -> str:
    version: Dict[str, str] = {}
    with open(Path(__file__).parent / "dagster_dbt/version.py", encoding="utf8") as fp:
        exec(fp.read(), version)

    return version["__version__"]


ver = get_version()
# dont pin dev installs to avoid pip dep resolver issues
pin = "" if ver == "1!0+dev" else f"=={ver}"
setup(
    name="dagster-dbt",
    version=ver,
    author="Elementl",
    author_email="hello@elementl.com",
    license="Apache-2.0",
    description="A Dagster integration for dbt",
    url="https://github.com/dagster-io/dagster/tree/master/python_modules/libraries/dagster-dbt",
    classifiers=[
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    packages=find_packages(exclude=["dagster_dbt_tests*"]),
    install_requires=[
        "dagster==1.2.7",
        # Follow the version support constraints for dbt Core: https://docs.getdbt.com/docs/dbt-versions/core
        "dbt-core>=1.1",
        "networkx",
        "requests",
        "typer[all]",
    ],
    extras_require={
        "test": [
            "Jinja2",
            "dbt-rpc<0.3.0",
            "dbt-duckdb",
            "dagster-duckdb",
            "dagster-duckdb-pandas",
        ]
    },
    entry_points={
        "console_scripts": [
            "dagster-dbt-cloud = dagster_dbt.cloud.cli:app",
        ]
    },
    zip_safe=False,
)
