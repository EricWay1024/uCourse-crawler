import numpy as np
import pandas
import json
import os

os.remove("dist/data.db")


def json_to_sqlite(json_file, table_name, campus, obj_cols, num_cols=[]):
    """
    Converts a json file to a sqlite database.
    """
    data = pandas.read_json(json_file)
    for col in obj_cols:
        data[col] = data[col].apply(json.dumps)
    for col in num_cols:
        data[col] = data[col].apply(lambda x: "NAN" if np.isnan(x) else str(int(x)))
    data['campus'] = campus
    data.to_sql(table_name, con=f'sqlite:///dist/data.db', if_exists='append', index_label='id')

course_obj_cols = [
    "convenor",
    "requisites",
    "additionalRequirements",
    "courseWebLinks",
    "class",
    "assessment",
    "belongsTo",
]

course_num_cols = [
    "level",
    "credits",
]

plan_obj_cols = [
    "school",
    "planAccreditation",
    "subjectBenchmark",
    "modules",
    "courseWeightings",
    "degreeCalculationModel",
]

for campus in "CMU":
    json_to_sqlite(
        f'./dist/courseData-{campus}.json',
        f'course',
        campus,
        course_obj_cols,
        course_num_cols
    )

    json_to_sqlite(
        f'./dist/planData-{campus}.json',
        f'plan',
        campus,
        plan_obj_cols
    )


