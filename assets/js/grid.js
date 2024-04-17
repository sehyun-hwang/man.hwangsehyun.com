import { Grid, html } from "gridjs";

function buildData(golangTable) {
  const data = Array.from(golangTable.tBodies[0].rows, ({ cells }) =>
    Array.prototype.flatMap.call(cells, (cell) => {
      if (cell.classList.contains("number")) return Number(cell.textContent);

      const period = cell.querySelector(".period");
      if (!period) return cell;
      const [{ textContent: start }, { textContent: end }] = period.children;
      return [start + "_" + end, new Date(end) - new Date(start)];
    })
  );
  console.log(data);
  return data;
}

const columns = [
  {
    name: "Name",
    sort: {
      compare: ({ __e: aa }, { __e: bb }) => {
        const [{ textContent: a }, { textContent: b }] = [
          aa.querySelector(".name"),
          bb.querySelector(".name")
        ];
        if (a > b) {
          return 1;
        } else if (b > a) {
          return -1;
        } else {
          return 0;
        }
      }
    },
    attributes(cell) {
      console.log(cell);
      if (!cell?.__e) return {};
      return {
        class: cell
          ? "gridjs-td " + cell.__e.firstElementChild.classList.value
          : "gridjs-th"
      };
    }
  },
  {
    name: "Description",
    attributes: (cell) => ({
      class: cell ? "gridjs-td truncated" : "gridjs-th"
    })
  },
  "Technologies",
  {
    name: "Period",
    sort: true,
    attributes: (cell) => ({
      colspan: cell && "2"
    }),
    formatter: (data) => {
      const [start, end] = data.split("_").map((date) => new Date(date));
      const duration = (end - start) / 1000 / 3600 / 24 / 30;
      return html(
        `<li>From ${start.toLocaleDateString()}</li>
        <li>Until ${end.toLocaleDateString()}</li>
        <li>For ${duration.toFixed(1)} Months</li>`,
        "ul"
      );
    }
  },
  {
    name: "Duration",
    sort: true,
    attributes: (cell) => ({
      hidden: Boolean(cell)
    })
  },
  "Belonging",
  {
    name: "Importance",
    hidden: true
  }
];

async function renderGridjsData(data) {
  const section = document.createElement("section");
  const grid = new Grid({
    resizable: true,
    columns,
    data,
    className: {
      table: "project-table"
    }
  });

  const readyPromise = new Promise((resolve, reject) => {
    grid.config.store.subscribe(
      (state, prevState) =>
        prevState.status === 2 && state.status === 3 && resolve(section)
    );
    setTimeout(100, reject);
  });
  grid.render(section);
  return readyPromise;
}

const appendGridjs = (golangTable = document.querySelector(".project-table")) =>
  renderGridjsData(buildData(golangTable))
    .then((gridjsTable) => golangTable.replaceWith(gridjsTable))
    .catch((error) => {
      console.error(error);
      golangTable.prepend("Error: " + error.message);
      golangTable.style.display = "unset";
    });

appendGridjs();
