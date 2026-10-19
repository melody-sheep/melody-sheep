// Builds contributions.svg: a dark-theme contribution calendar where each
// activity level has its own color, plus a legend.
// Runs in GitHub Actions (Node 20+, no packages needed).

const fs = require("fs");

const USERNAME = process.env.USERNAME || "melody-sheep";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT_FILE || "contributions.svg";

// Levels: [minimum contributions, color, legend label]
const LEVELS = [
  [0, "#161B22", "0"],
  [1, "#22C55E", "1–2"],
  [3, "#06B6D4", "3–4"],
  [5, "#3B82F6", "5–7"],
  [8, "#A855F7", "8–11"],
  [12, "#EC4899", "12+"],
];

const colorFor = (n) => {
  let c = LEVELS[0][1];
  for (const [min, color] of LEVELS) if (n >= min) c = color;
  return c;
};

async function getCalendar() {
  if (process.env.DATA_FILE) {
    return JSON.parse(fs.readFileSync(process.env.DATA_FILE, "utf8"));
  }
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount weekday } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user.contributionsCollection.contributionCalendar;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (d) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
};

function build(cal) {
  const CELL = 11, GAP = 3, STEP = CELL + GAP;
  const PAD = 24, LEFT = 36, TOP = 96;
  const weeks = cal.weeks;
  const gridW = weeks.length * STEP - GAP;
  const W = PAD + LEFT + gridW + PAD;
  const H = TOP + 7 * STEP + 66;
  const font = `font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"`;

  // Stats
  const days = weeks.flatMap((w) => w.contributionDays);
  const best = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a), days[0]);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) streak++;
    else if (i === days.length - 1) continue; // today may not have activity yet
    else break;
  }
  const activeDays = days.filter((d) => d.contributionCount > 0).length;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n`;
  s += `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="#0D1117" stroke="#30363D"/>\n`;

  // Header
  s += `<text x="${PAD}" y="36" ${font} font-size="16" font-weight="600" fill="#E6EDF3">${cal.totalContributions} contributions in the last year</text>\n`;
  s += `<text x="${PAD}" y="56" ${font} font-size="12" fill="#8B949E">Active days: <tspan fill="#E6EDF3" font-weight="600">${activeDays}</tspan>  ·  Current streak: <tspan fill="#E6EDF3" font-weight="600">${streak} day${streak === 1 ? "" : "s"}</tspan>  ·  Best day: <tspan fill="#E6EDF3" font-weight="600">${best.contributionCount}</tspan> on ${fmtDate(best.date)}</text>\n`;

  // Month labels
  let lastMonth = -1, lastLabelWeek = -10;
  weeks.forEach((w, i) => {
    const first = w.contributionDays[0];
    const m = Number(first.date.split("-")[1]) - 1;
    const monthAt = (k) => Number(weeks[Math.min(k, weeks.length - 1)].contributionDays[0].date.split("-")[1]) - 1;
    const partialStart = i === 0 && monthAt(3) !== m;
    if (m !== lastMonth) {
      if (!partialStart && i - lastLabelWeek >= 3 && i < weeks.length - 2) {
        s += `<text x="${PAD + LEFT + i * STEP}" y="${TOP - 8}" ${font} font-size="11" fill="#8B949E">${MONTHS[m]}</text>\n`;
        lastLabelWeek = i;
      }
      lastMonth = m;
    }
  });

  // Day labels
  [["Mon", 1], ["Wed", 3], ["Fri", 5]].forEach(([label, d]) => {
    s += `<text x="${PAD}" y="${TOP + d * STEP + 9}" ${font} font-size="11" fill="#8B949E">${label}</text>\n`;
  });

  // Cells
  weeks.forEach((w, i) => {
    w.contributionDays.forEach((d) => {
      const x = PAD + LEFT + i * STEP;
      const y = TOP + d.weekday * STEP;
      const n = d.contributionCount;
      s += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${colorFor(n)}"${n === 0 ? ' stroke="#21262D"' : ""}><title>${n} contribution${n === 1 ? "" : "s"} on ${fmtDate(d.date)}</title></rect>\n`;
    });
  });

  // Legend
  const ly = TOP + 7 * STEP + 30;
  s += `<text x="${PAD}" y="${ly + 9}" ${font} font-size="11" fill="#8B949E">Contributions per day:</text>\n`;
  let lx = PAD + 140;
  for (const [, color, label] of LEVELS) {
    s += `<rect x="${lx}" y="${ly}" width="${CELL}" height="${CELL}" rx="2" fill="${color}"${color === LEVELS[0][1] ? ' stroke="#30363D"' : ""}/>\n`;
    s += `<text x="${lx + CELL + 6}" y="${ly + 9}" ${font} font-size="11" fill="#C9D1D9">${label}</text>\n`;
    lx += CELL + 6 + label.length * 7 + 18;
  }
  s += `<text x="${W - PAD}" y="${ly + 9}" text-anchor="end" ${font} font-size="11" fill="#6E7681">@${USERNAME}</text>\n`;

  s += `</svg>\n`;
  return s;
}

getCalendar()
  .then((cal) => {
    fs.writeFileSync(OUT, build(cal));
    console.log(`Wrote ${OUT}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
