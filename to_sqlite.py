import numpy as np
import pandas
import json

def json_to_sqlite(json_file, table_name, obj_cols, num_cols=[]):
    """
    Converts a json file to a sqlite database.
    """
    data = pandas.read_json(json_file)
    for col in obj_cols:
        data[col] = data[col].apply(json.dumps)
    for col in num_cols:
        data[col] = data[col].apply(lambda x: "NAN" if np.isnan(x) else str(int(x)))
    data.to_sql(table_name, con='sqlite:///dist/data.db', if_exists='replace', index_label='id')

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

json_to_sqlite(
    './dist/courseData.json',
    'course',
    course_obj_cols,
    course_num_cols
)

json_to_sqlite(
    './dist/planData.json',
    'plan',
    plan_obj_cols
)


