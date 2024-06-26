from pathlib import Path
from typing import Dict

from setuptools import find_packages, setup


def get_version() -> str:
    version: Dict[str, str] = {}
    with open(Path(__file__).parent / "dagster_sdf/version.py", encoding="utf8") as fp:
        exec(fp.read(), version)

    return version["__version__"]


ver = get_version()
# dont pin dev installs to avoid pip dep resolver issues
pin = "" if ver == "1!0+dev" else f"=={ver}"
setup(
    name="dagster-sdf",
    version=ver,
    author="SDF Labs",
    author_email="hello@sdf.com",
    license="Apache-2.0",
    description="A Dagster integration for sd",
    url="https://github.com/dagster-io/dagster/tree/master/python_modules/libraries/dagster-sdf",
    classifiers=[
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    packages=find_packages(exclude=["dagster_sdf_tests*"]),
    python_requires=">=3.8,<3.13",
    install_requires=[f"dagster{pin}"],
    zip_safe=False,
    extras_require={"test": []},
)
