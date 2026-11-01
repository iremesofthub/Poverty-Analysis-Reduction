// Easy-English text for the eye icon on every card. Written for readers aged about 15
// who are still learning English: short sentences, common words.
// If a card title is listed here, this text is shown. Otherwise the card's own `info` is used.
export const CARD_HELP = {
  // Poverty Analysis
  "Poverty by District": "Each bar is one district. The bar shows how many people out of 100 are poor. A longer bar means more poor people, not a bigger district. The dashed line is the number for all of Rwanda.",
  "Poverty Changes": "Each line joins two dots for one district. The empty dot is 2016/17. The full dot is 2023/24. The longer the line, the bigger the change. The 2016/17 numbers are estimates, so small changes may not be real.",
  "Financial Inclusion": "Think of 100 adults in Rwanda. Each part of the circle shows how many use banks, other money services, or neither. These numbers are for the whole country. They do not change when you pick a province.",
  "Poverty & Social Support": "Each dot or row is a district. Poverty counts people. VUP counts poor households. They are different groups, so do not subtract one from the other. Review first only means: poverty is above the national number and VUP is below it. It does not mean something is wrong.",
  "Programme delivery": "This shows what the programme records say, next to the poverty numbers. Programme records and the survey are different sources, so compare them with care.",
  "District Needs": "Pick a district. The dark mark shows the number for all of Rwanda. You can see if the district is better or worse than the country.",
  "Priority Districts": "These districts have the most poverty. They are a good place to start looking. This is not a final choice about who gets help.",

  // National Goals
  "Latest Numbers": "These are the newest key numbers from the national survey. Each bar is one number shown as a percent.",
  "Targets": "These are the official goals for 2024 to 2029. Compare them with the latest numbers to see how far we have to go.",

  // Programme Results
  "Payments Delivered": "This chart shows money sent out each month in the demo data. It is sample data, not real payments. A line that goes up means more money was sent in the demo.",
  "Payment Journey": "This shows the steps in the demo data, from joining to getting money. Each step counts demo records, not real families. A big drop is a place to look at the workflow again.",
  "Programme Mix": "This shows the share for each programme in the demo data. One household can be in more than one programme, so these shares do not add up to a number of families.",
  "Programme Performance": "This table shows the demo data for each programme: money, member records, and status. These are not official programme totals. Watch means the record needs a closer look.",

  // Data Sources
  "Datasets": "These are the data files the app uses. Click one to see who made it and which year it is from.",
  "Confidence Intervals": "A confidence interval is a range around a number. A wide range means we are less sure about the number.",
  "Indicator Dictionary": "This is a word list. It explains each number and word used in the app.",

  // Field work
  "Today's visits": "This is your list of visits for today.",
  "Record a visit": "After you visit a family, write down what happened here.",
  "Problem reports": "These are problems you sent to the office.",

  // My benefits
  "Next payment": "This shows how much money you will get and when.",
  "Your programmes": "These are the programmes you have joined.",
  "Submit a complaint": "Is something wrong? Write it here and send it. You will get an answer in 5 working days.",

  // Government
  "Poverty by sector": "Each bar is one sector. A longer bar means more poor households.",
  "Priority villages": "These villages need a closer look this month.",
  "Sectors": "This table lists every sector with its numbers.",

  // Jobs
  "Your application": "This shows how your job application is going.",
  "Open positions": "These jobs are open now. Press the button on a job to apply.",

  // Programme management
  "Program Members by skill": "This shows the skills that people learned. A longer bar means more people learned that skill.",
  "Programmes": "These are the programmes that are running now.",
  "Cooperatives": "A cooperative is a group of people who work together. This shows how many people are in one.",
  "Recent awards": "These are the latest prizes for people who learned new skills.",
  "Send cash to member": "Use this to send money to one person. The money arrives at once.",
  "Payment history": "This is a list of the latest payments.",
  "Skills catalog": "This is a list of the skills that field agents teach.",
  "Awards & achievements": "Prizes for people who finish training. They help others want to learn too.",
  "How it works": "This explains how field agents help people learn new skills.",
  "Program Member registry": "This is the list of people who get help from the programme.",

  // District Map
  "Districts": "Click a name to find the district on the map. Review first lists districts where poverty is above the national number and VUP is below it.",
};

export const helpFor = (title, fallback = null) => (typeof title === "string" && CARD_HELP[title]) || fallback;
