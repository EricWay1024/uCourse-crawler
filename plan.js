const puppeteer = require("puppeteer");
// const consola = require("consola");
const progressBar = require("progress-bar-cli");
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
    headless: false,
    // slowMo: 50,
    args: ["–disable-gpu", "–single-process", "–no-sandbox", "–no-zygote"],
  },
};

const initBrowser = async () => {
  const browser = await puppeteer.launch(CONFIGS.browser);
  const page = await browser.newPage();
  return { browser, page };
};

const login = async (page) => {
    // Login
    await page.waitForSelector('#userid');
    await page.$eval('#userid', (el, v) => el.value = v, process.env.USER_ID);
    await page.$eval('#pwd', (el, v) => el.value = v, process.env.USER_PASSWORD);
    await page.click('[name=Submit]');
}

const preSearch = async (page) => {
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

  // Home Page
  // consola.log("Clicking 'Search for Plans' button...");
  await page.waitForSelector("#UN_PAM_EXTR_WRK_UN_PLAN_PB");
  await page.click("#UN_PAM_EXTR_WRK_UN_PLAN_PB");
  await page.waitForSelector("#UN_PAM_EXTR_WRK_CAMPUS");

  await preSearch(page);
}

const searchCode = async (page, keyword, retries = 10) => {
  try {
    await page.$eval('#UN_PAM_EXTR_WRK_DESCR5_1', (el, v) => el.value = v, keyword);
    await new Promise(r => setTimeout(r, 1000));
    await page.click('#UN_PAM_EXTR_WRK_SEARCH');
    await page.waitForSelector('[id="UN_PAM_EXTR_WRK_RETURN_PB"]');
  } catch (e) {
    if (retries === 0) {
      throw e;
    } else {
      await page.reload();
      await preSearch(page);
      await searchCode(page, keyword, retries - 1);
    }
  }
};

const getPlans = async (page) => {
  const plans = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'tr'
      ),
    ]
      .filter((el) => el.id)
      .map((el, j) => ({
        ucasCode: document.getElementById(`UN_PAM_PLAN_VW_DESCRSHORT$${j}`).innerText,
        planCode: document.getElementById(`UN_PAM_PLAN_VW_ACAD_PLAN$${j}`).innerText,
        title: document.getElementById(`UN_PAM_PLAN_VW_TRNSCR_DESCR$${j}`).innerText,
      }))
  );

  // consola.ready(`${plans.length} Plans loaded`);
  return plans;
};


const close = async () => {
  process.exit();
};


const parsePlanPage = async (page) => {
  return await page.evaluate(() => {
    const gE = (id) => document.getElementById(id)?.innerHTML?.trim();
    const gT = (id) =>
      [
        ...document.querySelectorAll(`[id="${id}"] > tbody > tr`),
      ].filter((el) => el.id);
    const selectInElement = ({ el, selector = null, id = null}) => {
      return el.querySelector(id ? `[id="${id}"]` : selector)?.innerHTML?.trim();
    }
    
    const parseModules = () => {
      const trs = [
        ...document.querySelectorAll(`[id="ACE_UN_PAM_PEAM_VW$0"] > tbody > tr`),
      ];

      // const defaultYear = {
      //   title: null,
      //   groups: [],
      //   additionalCourseChoice: "",
      // };
      // const defaultGroup = {
      //   title: null,
      //   type: "",
      //   message: "",
      //   modules: [],
      // }

      const dataHandler = () => {
        const plan = [];

        let year = { title: null, groups: [] };
        let group = {};

        const pushGroup = () => {
          if (group.title) {
            year.groups.push(group);
            group = {};
          }
        }

        const pushYear = () => {
          if (year.title) {
            pushGroup();
            plan.push(year);
            year = { title: null, groups: [] };
          }
        }

        const setYearTitle = (title) => {
          pushYear();
          year.title = title;
        }

        const setYearAdditional = (additional) => {
          year.additionalCourseChoice = additional;
        }

        const setGroupTitle = title => {
          pushGroup();
          group.title = title;
        }

        const setGroupType = type => {
          group.type = type;
        }

        const setGroupMessage = message => {
          group.message = message;
        }

        const setGroupModules = (modules) => {
          group.modules = modules;
        }

        const getPlan = () => {
          pushYear();
          return plan;
        }

        return {
          setYearTitle,
          setYearAdditional,
          setGroupTitle,
          setGroupType,
          setGroupMessage,
          setGroupModules,
          getPlan,
        };
      }

      const dh = dataHandler();
      
      const getModulesFromGroup = (fa, trSelector) => {
        return [
          ...fa.querySelectorAll(trSelector)
        ]
          .filter(el => el.id)
          .map((el) => {
            const codeMatch = el.outerHTML.match(/UN_PAM_QUAL_VW([0-9]+)_UN_PAM_COURSECODE\$([0-9]+)/);
            if (!codeMatch) {
              console.error(el);
              return {};
            }
            const n = codeMatch[1];
            const m = codeMatch[2];
            const taughtMatch = el.outerHTML.match(/SSR_CRSE_TYPOFF_DESCR[$0-9]+/g)[0];
            return {
              code: gE(`UN_PAM_QUAL_VW${n}_UN_PAM_COURSECODE$${m}`),
              title: gE(`UN_PAM_QUAL_VW${n}_COURSE_TITLE_LONG$${m}`),
              credits: gE(`UN_PAM_QUAL_VW${n}_UNITS_MINIMUM$${m}`),
              compensatable: gE(`UN_PAM_QUAL_VW${n}_SCC_CAF_ATTR_YNO$${m}`),
              taught: gE(taughtMatch),
            }
          });
      }

      trs.forEach(tr => {
        const s = tr.innerHTML;

        const isTitle = s.includes("UN_PAM_PEAM_VW_DESCR50");
        const isCompulsoryGroup = s.includes("UN_PAM_PLAN_WRK_UN_PAM_COMPULSORY");
        const isRestrictedGroup = s.includes("ACE_UN_PAM_RESTR_VW");
        const isAlternativeGroup = s.includes("ACE_UN_PAM_ALTER_VW");
        const isAdditionalChoice = s.includes("ACE_UN_PAM_ADDT_VW");
        
        if (isTitle) {
          // title of the year
          const titleId = s.match(/UN_PAM_PEAM_VW_DESCR50\$[0-9]+/g)[0];
          dh.setYearTitle(selectInElement({ el: tr, id: titleId }));
        } 
        
        else if (isCompulsoryGroup) {
          // a compulsory group
          dh.setGroupTitle("Compulsory");
          dh.setGroupType("Compulsory");

          const messageId = s.match(/win0divUN_PAM_PLAN_WRK_UN_PAM_COMPULSORY\$[0-9]+/g)[0];
          dh.setGroupMessage(selectInElement({ el: tr, selector: `[id="${messageId}"] > table > tbody > tr:nth-child(1) > td` }));

          const moduleId = s.match(/UN_PAM_QUAL_VW[0-9]+\$scroll\$[0-9]+/g)[0];
          dh.setGroupModules(getModulesFromGroup(tr, `[id="${moduleId}"] > tbody > tr > td > table > tbody > tr`));
        }
        
        else if (isRestrictedGroup || isAlternativeGroup) {
          // restricted group(s)
          const tableId = isRestrictedGroup ? 
            s.match(/ACE_UN_PAM_RESTR_VW\$[0-9]+/g)[0] :
            s.match(/ACE_UN_PAM_ALTER_VW\$[0-9]+/g)[0];
          const subTrs = [
            ...tr.querySelectorAll(`[id="${tableId}"] > tbody > tr`)
          ];

          subTrs.forEach(subTr => {
            const subS = subTr.innerHTML;
            const isGroupTitle = subS.includes("UN_PAM_RESTR_VW_DESCR50") || 
              subS.includes("UN_PAM_ALTER_VW_DESCR50");
            const isGroupMessage = subS.includes("win0divUN_PAM_PLAN_WRK_UN_RESTRICT_MSG") ||
              subS.includes("win0divUN_PAM_PLAN_WRK_UN_ALTER_MSG");
            const isGroupModules = subS.match(/UN_PAM_QUAL_VW[0-9]+\$scroll\$[0-9]+/g);

            if (isGroupTitle) {
              // title of the group
              const groupTitleId = isRestrictedGroup ?
                subS.match(/UN_PAM_RESTR_VW_DESCR50\$[0-9]+/g)[0] :
                subS.match(/UN_PAM_ALTER_VW_DESCR50\$[0-9]+/g)[0];
              dh.setGroupTitle(gE(groupTitleId));
              if (isRestrictedGroup) dh.setGroupType("Restricted")
              else dh.setGroupType("Alternative");
            }

            else if (isGroupMessage) {
              // message of the group
              const groupMessageId = isRestrictedGroup ?
                subS.match(/win0divUN_PAM_PLAN_WRK_UN_RESTRICT_MSG\$[0-9]+/g)[0]:
                subS.match(/win0divUN_PAM_PLAN_WRK_UN_ALTER_MSG\$[0-9]+/g)[0];
              dh.setGroupMessage(selectInElement({ el: subTr, id: groupMessageId }));
            }

            else if (isGroupModules) {
              const moduleId = subS.match(/UN_PAM_QUAL_VW[0-9]+\$scroll\$[0-9]+/g)[0];
              dh.setGroupModules(getModulesFromGroup(tr, `[id="${moduleId}"] > tbody > tr:nth-child(2) > td > table > tbody > tr`));
            }
          })
        }

        else if (isAdditionalChoice) {
          // additional course choice
          const additionalId = s.match(/ACE_UN_PAM_ADDT_VW\$[0-9]+/g)[0];
          dh.setYearAdditional(gE(additionalId));
        }
      })

      return dh.getPlan();
    }

    return {
      title: gE("UN_PAM_EXTR_WRK_DESCR200"),
      academicPlanCode: gE("UN_PAM_PLAN_DTL_ACAD_PLAN"),
      ucasCode: gE("UN_PAM_PLAN_VW_DESCRSHORT"),
      school: gT("UN_PAM_OWNR_VW$scroll$0").map((_, k) => ({
        school: gE(`UN_PAM_OWNR_VW_DESCRFORMAL$${k}`),
        percentage: gE(`UN_PAM_EXTR_WRK_UN_PERCENT_OWNED$${k}`),
      })),
      planType: gE("UN_PAM_PLAN_DTL_UN_PLAN_TYPE"),
      academicLoad: gE("UN_PAM_PLAN_DTL_UN_ACADEMIC_LOAD"),
      deliveryMode: gE("UN_PAM_PLAN_DTL_UN_DELIVERY_MODE"),
      planAccreditation: gT("UN_PAM_ACCRDTN$scroll$0").map((_, k) => ({
        accreditation: gE(`UN_PAM_ACCRDTN_DESCRLONG$${k}`),
      })),
      subjectBenchmark: gT("UN_PAM_BENM_SUB$scroll$0").map((_, k) => ({
        subject: gE(`UN_PAM_BENM_SUB_DESCR254$${k}`),
      })),
      educationalAimsIntro: gE("UN_PAM_PLAN_DTL_UN_INTRODUCTION"),
      educationalAims: gE("ACE_UN_PAM_AIMS_VW$0"),
      outlineDescription: gE("UN_PAM_PLAN_DTL_UN_OUTLN_DESC_PGM"),
      distinguishingFeatures: gE("UN_PAM_PLAN_DTL_UN_DISTINGSH_FEATU"),
      furtherInformation: gE("UN_PAM_PLAN_DTL_UN_FURTHR_INFORMTN"),
      planRequirements: gE("UN_PAM_PLAN_DTL_UN_PLAN_RQMNTS"),
      includingSubjects: gE("UN_PAM_PLAN_DTL_UN_REQ_SUBJECTS"),
      excludingSubjects: gE("UN_PAM_PLAN_DTL_UN_EXCLUDE_SUBJECT"),
      otherRequirements: gE("UN_PAM_PLAN_DTL_UN_OTHER_REQ"),
      ieltsRequirements: gE("UN_PAM_PLAN_DTL_UN_IELTS"),
      generalInformation: gE("UN_PAM_PLAN_DTL_UN_GENERAL_INFO"),
      modules: parseModules(),
      assessment: gE("UN_PAM_EXTR_WRK_DESCRLONG"),
      assessmentMarking: gE("UN_PAM_PLAN_DTL_UN_ASSESMNT_MRKT") + gE("win0divUN_PAM_EXTR_WRK_HTMLAREA12"),
      progressionInformation: gE("UN_PAM_PLAN_DTL_UN_ASSMNT_PROG_REG"),
      borderlineCriteria: gE("UN_PAM_PLAN_DTL_UN_BRDR_LN_DESCR"),
      degreeInformation: gE("UN_PAM_PLAN_DTL_UN_ASSES_AWARD_REG"),
      courseWeightings: gT("UN_QAA_CRSE_WTS$scroll$0").map((_, k) => ({
        part: gE(`PSXLATITEM_XLATLONGNAME$${k}`),
        percentage: gE(`UN_QAA_CRSE_WTS_PERCENTAGE$${k}`),
      })),
      degreeCalculationModel: gT("UN_QAA_CWT_NOTE$scroll$0").map((_, k) => ({
        model: gE(`PSXLATITEM_XLATLONGNAME$258$$${k}`),
      })),
      otherRegulations: gE("UN_PAM_PLAN_DTL_UN_OTHER_REGULATN"),
      notwithstandingRegulations: gE("UN_PAM_PLAN_DTL_UN_STANDNG_REGULTN"),
      overview: gE("UN_PAM_PLAN_DTL_UN_OVERVIEW"),
      assessmentMethods: gE("UN_PAM_PLAN_DTL_UN_ASSEMNT_SUMM"),
      teachingAndLearning: gE("UN_PAM_PLAN_DTL_UN_TEACH_LRN_SUMM"),
      learningOutcomes: gE("ACE_UN_QA_LRN_OUTCO$0"),
    };
  });
}


const getPlansForCode = async (page, planCode) => {
  const results = [];

  await searchCode(page, planCode);
  const plans = await getPlans(page);
  await page.reload();
  await preSearch(page);

  const maxTrial = plans.length * 20;
  const trialCnt = 0;

  for (let j = 0; j < plans.length; j++) {
    await searchCode(page, planCode);

    // const plan = plans[j];
    // consola.start(`> Plan <${plan.title}> [${j + 1}/${plans.length}]`);

    try {
      const planSelector = `[id="UN_PAM_EXTR_WRK_DETAILS_PB$${j}"]`;
      await page.waitForSelector(planSelector);
      const icon = await page.$(planSelector);
      await icon.evaluate((el) => el.click());
      await page.waitForSelector('[id="win0divUN_PAM_EXTR_WRK_HTMLAREA1"]', { timeout: 60000 });
      const result = await parsePlanPage(page);
      results.push(result);
    } 
    
    catch (e) {
      trialCnt += 1;
      if (trialCnt > maxTrial) {
        throw new Error('Too many trials');
      }
      j--;
      await page.reload();
      await preSearch(page);
    }

    await page.reload();
    await preSearch(page);
  }

  return results;
}

const generatePlanList = async () => {
  const { browser, page } = await initBrowser();
  await init(page);
  const alphaNum = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let plans = [];
  let startTime = new Date();
  for (let i = 0; i < alphaNum.length; i++) {
    progressBar.progressBar(i, alphaNum.length, startTime);
    await searchCode(page, alphaNum[i]);

    const noResult = await page.evaluate(() => {
      return document.documentElement.innerHTML.match(
        /No details have been found for this search/g
      );
    });
    if (noResult) {
      continue;
    }

    while (true) {
      const plansInPage = await page.evaluate(() => {
        const gE = (id) => document.getElementById(id)?.innerHTML?.trim();
        return document
          .getElementById("win0divUN_PAM_PLAN_VW$0")
          .innerHTML
          .match(/UN_PAM_PLAN_VW_DESCRSHORT\$[0-9]+/g)
          .map(id => gE(id));
      });

      plans.push(...plansInPage);
      plans = [...new Set(plans)];

      const nextPage = await page.$("[id='UN_PAM_PLAN_VW$hdown$0']");
      if (nextPage) {
        await nextPage.evaluate((el) => el.click());
        await new Promise(r => setTimeout(r, 1000));
      } 
      
      else { break; }
    }
    // console.log(plans.length);
    await page.reload();
    await preSearch(page);
  }

  // save plans to json
  fs.writeFileSync(`./dist/plans-${CONFIGS.campus_code}.json`, JSON.stringify(plans));
  browser.close();
}

const main = async () => {
  const { browser, page } = await initBrowser();
    
  await init(page);
  // read plans from json
  let planCodeList;
  try {
    planCodeList = JSON.parse(fs.readFileSync(`./dist/plans-${CONFIGS.campus_code}.json`));
  } catch(e) {
    await generatePlanList();
    planCodeList = JSON.parse(fs.readFileSync(`./dist/plans-${CONFIGS.campus_code}.json`));
  }

  const numOfConcurrent = 15;

  // split planCodeList into numOfConcurrent
  const planCodeListPerConcurrent = planCodeList.reduce((acc, cur, i) => {
    const index = Math.floor(i / (planCodeList.length / numOfConcurrent));
    acc[index] = acc[index] || [];
    acc[index].push(cur);
    return acc;
  }, []);

  let cnt = 0;

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: numOfConcurrent,
    puppeteerOptions: CONFIGS.browser,
    timeout: 1 << 30,
    retryLimit: 10,
  });

  let startTime = new Date();

  await cluster.task(async ({ page, data }) => {
    const { conNum } = data;
    const currentPlanCodeList = planCodeListPerConcurrent[conNum];
    const currentResults = [];
  
    await init(page);
  
    for (let i = 0; i < currentPlanCodeList.length; i++) {
        const planCode = currentPlanCodeList[i];
        try {
          const results = await getPlansForCode(page, planCode);
          currentResults.push(...results);

          progressBar.progressBar(cnt, planCodeList.length, startTime);
          cnt += 1;
        } catch (e) {
          console.error(planCode);
          console.error(e);
          continue;
        }
    }
    return currentResults;
  })

  const allResults = [];
  for (let i = 0; i < planCodeListPerConcurrent.length; i++) {
    cluster
      .execute({ conNum: i })
      .then((currentResults) => {
        allResults.push(...currentResults);
      })
  }

  await cluster.idle();
  await cluster.close();
  // save all results to file
  const json = JSON.stringify(allResults, null, 2);
  // add time stamp to file name
  const timeStamp = new Date().toISOString().replace(/:/g, "-");
  fs.writeFileSync(`./dist/planData-${CONFIGS.campus_code}-${timeStamp}.json`, json);
  fs.writeFileSync(`./dist/planData-${CONFIGS.campus_code}.json`, json);
};

main();