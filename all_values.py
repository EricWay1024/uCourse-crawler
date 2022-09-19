import json

res = {}

for campus in "CMU":
    course_data = json.loads(open(f"./dist/courseData-{campus}.json").read())
    all_schools = set()
    all_levels = set()
    all_credits = set()
    all_semesters = set()

    for course in course_data:
        all_schools.add(course["offering"])
        all_levels.add(course["level"])
        all_credits.add(course["credits"])
        all_semesters.add(course["semester"])

    p = lambda xs: sorted([str(x) for x in xs])

    res[campus] = {
        "allSchools": p(all_schools),
        "allLevels": p(all_levels),
        "allCredits": p(all_credits),
        "allSemesters": p(all_semesters),
    }

json.dump(res, open("./dist/all_values.json", "w"), indent=4)

    