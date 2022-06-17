# uCourse-crawler
🎒 Scrape the courses info from the University of Nottingham's website. (Different campuses and academic years supported.)

This fork is modified to fit the needs of Nott Course: 

- [EricWay1024/nott-course: React app of an unofficial enhancement of the course catalogue offered by University of Nottingham.](https://github.com/EricWay1024/nott-course)
- [EricWay1024/nott-course-server-cpp: C++ Web Server for Nott Course, an unofficial enhancement of the course catalogue offered by University of Nottingham.](https://github.com/EricWay1024/nott-course-server-cpp)

What have I done?

- Included complete information of the course page;
- Added the scraper for academic plans, with fully parsed plan structures;
- Adapted the project to concurency using [pupeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster);
- Replaced Mongodb support with a converter from JSON to SQLite (for performance reasons).

## Requirements

- Nodejs
- Python

## Usage

Note that for performance reasons, no file will be written until all courses/plans are obtained. 

```bash
git clone https://github.com/EricWay1024/uCourse-crawler
cd uCourse-crawler
npm i
pip3 install pandas numpy
```

Launch the course scraper:

```bash
node course.js
```

(This will save result to `./dist/courseData.json`.)

Launch the plan scraper:

```bash
node plan.js
```

(This will save result to `./dist/planData.json`. Also, a file `./dist/plans.json` containing all possible plan UCAS codes will be created in the process.)

Convert to SQLite:

```bash
python3 find_deg.py
python3 to_sqlite.py
```

(This will infer the degree type of all plans and add to plan objects. Then the data is saved to `./dist/data.db`.)

### Output (JSON file)

For local JSON file, the output will be in a JSON format stored in `/dist/[tablename].json`. 

The output example:

![output-json](https://ae01.alicdn.com/kf/Ue83678fcf72e4906846dad02c87c00f06.jpg)

## Size

The estimated output size will be 50~60 MB if both courses and plans are crawled for a campus a year.

## Todo



## Resources

- Resouce website: <https://mynottingham.nottingham.ac.uk/psp/psprd/EMPLOYEE/HRMS/c/UN_PROG_AND_MOD_EXTRACT.UN_PAM_CRSE_EXTRCT.GBL>

