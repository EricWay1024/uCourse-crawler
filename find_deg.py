import json
degree_list = open("./degree.txt", "r").read().split("\n")

for campus in "CMU":
    plan_data = json.loads(open(f"./dist/planData-{campus}.json").read())
    for plan in plan_data:
        title = plan["title"]
        if title.startswith("Bachelor"):
            plan['degreeType'] = "Bachelor"
        elif title.startswith("Certificate"):
            plan['degreeType'] = "Certificate"
        elif title.startswith("Doctor"):
            plan['degreeType'] = "Doctor"
        elif title.startswith("Graduate Diploma"):
            plan['degreeType'] = "Graduate Diploma"
        elif title.startswith("Master"):
            plan['degreeType'] = "Master"
        elif title.startswith("No Qualification"):
            plan['degreeType'] = "No Qualification"
        elif title.startswith("Postgraduate Certificate") or title.startswith("Post Graduate Certificate"):
            plan['degreeType'] = "Postgraduate Certificate"
        elif title.startswith("Postgraduate Diploma"):
            plan['degreeType'] = "Postgraduate Diploma"
        elif title.startswith("Professional Doctorate"):
            plan['degreeType'] = "Professional Doctorate"
        else:
            plan['degreeType'] = "Unknown"
            print(title)

        for degree in degree_list:
            if title.startswith(degree):
                plan['degree'] = degree
                break
        else:
            plan['degree'] = "Unknown"
            print(title)

    # dump plan to file
    with open(f"./dist/planData-{campus}.json", "w") as f:
        json.dump(plan_data, f, indent=2)
