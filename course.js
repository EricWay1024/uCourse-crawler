const puppeteer = require("puppeteer");
const consola = require("consola");
const prompts = require("prompts");
const fs = require("fs-extra");
const { Cluster } = require('puppeteer-cluster');
require('dotenv').config();

const CONFIGS = {
  campus: undefined,
  campus_code: undefined,
  year: undefined,
  year_code: undefined,
  browser: {
    headless: true,
    // slowMo: 50,
    args: ["–disable-gpu", "–single-process", "–no-sandbox", "–no-zygote"],
  },
};

const initBrowser = async () => {
  const browser = await puppeteer.launch(CONFIGS.browser);
  const page = await browser.newPage();
  consola.ready("Browser is ready");
  return { browser, page };
};

const login = async (page) => {
    // Login
    consola.log("Login...");
    await page.waitForSelector('#userid');
    await page.$eval('#userid', (el, v) => el.value = v, process.env.USER_ID);
    await page.$eval('#pwd', (el, v) => el.value = v, process.env.USER_PASSWORD);
    await page.click('[name=Submit]');
}

const preSearch = async (page) => {
  // Home Page
  // consola.log("Clicking 'Search for Courses' button...");
  await page.waitForSelector("#UN_PAM_EXTR_WRK_UN_MODULE_PB");
  await page.click("#UN_PAM_EXTR_WRK_UN_MODULE_PB");
  await page.waitForSelector("#UN_PAM_EXTR_WRK_CAMPUS");

  // Search Page
  // select campus
  if (!CONFIGS.campus) {
    const campuses = await page.evaluate(() =>
      [...document.querySelectorAll('[id="UN_PAM_EXTR_WRK_CAMPUS"] > option')]
        .filter((el) => el.value)
        .map((el) => ({
          value: el.value,
          title: el.innerText,
        }))
    );
    CONFIGS.campus_code = await prompts({
      type: "select",
      name: "campus",
      message: "Which campus?",
      choices: campuses,
    }).then((v) => v.campus);
    CONFIGS.campus = campuses.filter(
      (el) => el.value === CONFIGS.campus_code
    )[0].title;
  }

  await page.select("#UN_PAM_EXTR_WRK_CAMPUS", CONFIGS.campus_code);

  // select year
  await page.waitForSelector(`#UN_PAM_EXTR_WRK_STRM > option[value="3200"]`);

  if (!CONFIGS.year) {
    consola.log(`Selecting an academic year'...`);
    const years = await page.evaluate(() =>
      [...document.querySelectorAll('[id="UN_PAM_EXTR_WRK_STRM"] > option')]
        .filter((el) => el.value)
        .map((el) => ({
          value: el.value,
          title: el.innerText,
        }))
    );
    CONFIGS.year_code = await prompts({
      type: "select",
      name: "year",
      message: "Which year?",
      choices: years,
    }).then((v) => v.year);
    CONFIGS.year = years
      .filter((el) => el.value === CONFIGS.year_code)[0]
      .title.split(" ")[0];
  }

  await page.select("#UN_PAM_EXTR_WRK_STRM", CONFIGS.year_code);
};

const getSchools = async (page) => {
  const schools = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[id="UN_PAM_EXTR_WRK_UN_PAM_CRSE1_SRCH$0"] > option'
      ),
    ]
      .filter((el) => el.value.length !== 0)
      .map((el) => ({
        code: el.value,
        name: el.innerText,
      }))
  );
  return schools;
};

const searchSchool = async (page, schoolCode) => {
  await page.select('[id="UN_PAM_EXTR_WRK_UN_PAM_CRSE1_SRCH$0"]', schoolCode);
  await page.click('[id="UN_PAM_EXTR_WRK_UN_SEARCH_PB$0"]');
  await Promise.race([
    page.waitForSelector('[id="win0divUN_PAM_CRSE_VW$0"]'),
    page.waitForSelector("#win0divUN_PAM_EXTR_WRK_HTMLAREA8"),
  ]);
};

const getCourses = async (page) => {
  consola.log("Parsing courses...");
  const courses = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[id="UN_PAM_CRSE_VW$scroll$0"] > tbody > tr'
      ),
    ]
      .filter((el) => el.id)
      .map((el, j) => ({
        level: document.getElementById(`UN_PAM_CRSE_VW_UN_LEVEL1_DESCR$${j}`)
          .innerText,
        code: document.getElementById(`CRSE_CODE$${j}`).innerText,
        title: document.getElementById(`UN_PAM_CRSE_VW_COURSE_TITLE_LONG$${j}`)
          .innerText,
        semester: document.getElementById(`SSR_CRSE_TYPOFF_DESCR$${j}`)
          .innerText,
      }))
  );

  consola.ready(`${courses.length} Courses loaded`);
  return courses;
};

const close = async () => {
  process.exit();
};

const init = async (page) => {
  await page.emulate({
    userAgent:
      "Mozilla/5.0 (PlayBook; U; RIM Tablet OS 2.1.0; en-US) AppleWebKit/536.2+ (KHTML like Gecko) Version/7.2.1.0 Safari/536.2+",
    viewport: {
      width: 600,
      height: 8000,
      isMobile: true,
      hasTouch: true,
    },
  });
  await page.goto(
    "https://mynottingham.nottingham.ac.uk/psp/psprd/EMPLOYEE/HRMS/c/UN_PROG_AND_MOD_EXTRACT.UN_PAM_CRSE_EXTRCT.GBL?"
  );
  await page.goto(
    "https://campus.nottingham.ac.uk/psc/csprd/EMPLOYEE/HRMS/c/UN_PROG_AND_MOD_EXTRACT.UN_PAM_CRSE_EXTRCT.GBL?%252fningbo%252fasp%252fmoduledetails.asp"
  );
  await login(page);
  await preSearch(page);
}


const main = async () => {
  try {
    const { browser, page } = await initBrowser();
    
    await init(page);
    consola.success("Config Selected! GO GO GO! 🚀🚀🚀");
    const schools = await getSchools(page);
    const results = [];

    const cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 15,
      puppeteerOptions: CONFIGS.browser,
      timeout: 1 << 30,
    });
    
    await cluster.task(async ({ page, data }) => {
      const { i } = data;
      await page.reload();
      await init(page);
        
      const school = schools[i];
      const schoolResults = [];

      if (school.name === "United Kingdom") {
        return schoolResults; 
      }

      consola.start(`School <${school.name}> [${i + 1}/${schools.length}]`);
      await searchSchool(page, school.code);

      if ((await page.$("win0divUN_PAM_EXTR_WRK_HTMLAREA8")) !== null) {
        await page.click("UN_PAM_EXTR_WRK_UN_MODULE_PB");
        await page.waitForSelector("#UN_PAM_EXTR_WRK_CAMPUS");
      } else {
        // for this school
        const courses = await getCourses(page);

        // 👇
        for (let j = 0; j < courses.length; j++) {
          const course = courses[j];

          consola.start(
            `> Course <${course.title}> [${j + 1}/${courses.length}]`
          );

          // await page.waitFor(10000)
          try {
            const courseSelector = `[id="CRSE_CODE$${j}"]`;
            await page.waitForSelector(courseSelector);
            await page.click(courseSelector, { button: "middle" });
            await page.waitForSelector('[id="UN_PAM_CRSE_DTL_SUBJECT_DESCR$0"]');
          } catch (e) {
            // simply retry this course!
            j--;
            await page.reload();
            await preSearch(page);
            await searchSchool(page, school.code);
            continue;
          }
          // await page.screenshot({path: `l${j}.png`});

          try {
            const result = await page.evaluate((belongsTo) => {
              const gE = (id) => document.getElementById(id)?.innerHTML?.trim();
              const gT = (id) =>
                [
                  ...document.querySelectorAll(`[id="${id}"] > tbody > tr`),
                ].filter((el) => el.id);
  
              return {
                code: gE("UN_PAM_CRSE_DTL_SUBJECT_DESCR$0"),
                title: gE("UN_PAM_CRSE_DTL_COURSE_TITLE_LONG$0"),
                credits: Number(gE("UN_PAM_CRSE_DTL_UNITS_MINIMUM$0")),
                level: Number(gE("UN_PAM_CRSE_DTL_UN_LEVELS$0")),
                summary: gE("UN_PAM_CRSE_DTL_UN_SUMMARY_CONTENT$0"),
                aims: gE("UN_PAM_CRSE_DTL_UN_AIMS$0"),
                offering: gE("ACAD_ORG_TBL_DESCRFORMAL$0"),
                convenor: gT("UN_PAM_CRS_CONV$scroll$0").map((_, k) => ({
                  name: gE(`UN_PAM_CRS_CONV_NAME52$${k}`),
                })),
                semester: gE("SSR_CRSE_TYPOFF_DESCR$0"), // semesters?
                requisites: gT("UN_PRECOREQ2_VW$scroll$0").map((_, k) => ({
                  subject: gE(`PRE_CO_REQ_CRSE_CD$${k}`),
                  courseTitle: gE(`UN_PRECOREQ2_VW_COURSE_TITLE_LONG$${k}`),
                })),
                additionalRequirements: gT("UN_MOD_ADDRQ_VW$scroll$0").map((_, k) => ({
                  operator: gE(`CUSTM_OPER1$${k}`),
                  condition: gE(`UN_PAM_EXTR_WRK_DESCRLONG$${k}`),
                })),
                outcome: document
                  .getElementById('ACE_UN_QAA_CRSE_OUT$0')
                  .outerHTML
                  .match(/(?<!div)UN_QAA_CRSE_OUT_UN_LEARN_OUTCOME\$[0-9]+/g)
                  .map((id) => gE(id))
                  .join("\n"),
                targetStudents: gE("UN_PAM_CRSE_DTL_UN_TARGET_STDNTS$0"),
                assessmentPeriod: gE("UN_PAM_EXTR_WRK_UN_DESCRFORMAL$0"),
                courseWebLinks: gT("UN_PAM_CRSE_WEB$scroll$0").map((_, k) => ({
                  type: gE(`UN_PAM_CRSE_WEB_DESCR100$${k}`),
                  link: gE(`UN_PAM_CRSE_WEB_UN_WEB_LINK_URL$${k}`),
                })),
                class: gT("UN_PAM_CRSE_FRQ$scroll$0").map((_, k) => ({
                  activity: gE(`UN_PAM_CRSE_FRQ_SSR_COMPONENT$${k}`),
                  numOfWeeks: gE(`UN_PAM_EXTR_WRK_UN_CRSE_DURATN_WKS$${k}`),
                  numOfSessions: gE(`UN_PAM_EXTR_WRK_UN_CRSE_NUM_SESN$${k}`),
                  sessionDuration: gE(`UN_PAM_EXTR_WRK_UN_CRSE_DURATN_SES$${k}`),
                })),
                assessment: gT("UN_QA_CRSE_ASAI$scroll$0").map((_, k) => ({
                  type: gE(`UN_QA_CRSE_ASAI_DESCR50$${k}`),
                  weight: gE(`UN_QA_CRSE_ASAI_SSR_CW_WEIGHT$${k}`),
                  requirements: gE(`UN_QA_CRSE_ASAI_SSR_DESCRLONG$${k}`),
                })),
                belongsTo,
              };
            }, school)
            schoolResults.push(result);
          } catch (e) {
            consola.error(`${school.name}, ${course.title}`);
            consola.error(e);
            continue;
          }

          // consola.log("Reloading Page...");
          await page.reload();
          await preSearch(page);
          await searchSchool(page, school.code);
        }
      }

      return schoolResults;
    });

    for (let i = 0; i < schools.length; i++) {
      cluster.execute({ i }).then((schoolResults) => {
        results.push(...schoolResults);
      });
    }

    await cluster.idle();
    await cluster.close();

    const json = JSON.stringify(results, null, 2);
    // add time stamp to file name
    const timeStamp = new Date().toISOString().replace(/:/g, "-");
    fs.writeFileSync(`./dist/courseData-${CONFIGS.campus_code}-${timeStamp}.json`, json);
    fs.writeFileSync(`./dist/courseData-${CONFIGS.campus_code}.json`, json);

    await browser.close();
    consola.success("All done! 👍👍👍");
    await close();
  } catch (e) {
    consola.fatal(e);
  }
};

main();
