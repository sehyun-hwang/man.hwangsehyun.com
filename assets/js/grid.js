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
    search: true,
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

class GridjsManipulator {
  fireSearchEvent(query) {
    this.searchElement.value = query;
    this.searchElement.dispatchEvent(
      new Event("input", {
        bubbles: true,
        cancelable: true
      })
    );
  }

  // asc || desc
  setSort(id, direction) {
    const DIRECTION_SEQUENCE = ["neutral", "asc", "desc"];
    const button = this.element.querySelector(
      `.gridjs-th-sort[data-column-id='${id}'] button`
    );
    const currentDirection = button.classList[1].replace("gridjs-sort-", "");
    const diff =
      DIRECTION_SEQUENCE.indexOf(direction) -
      DIRECTION_SEQUENCE.indexOf(currentDirection);

    for (
      let i = 0;
      i < (diff >= 0 ? diff : DIRECTION_SEQUENCE.length + diff);
      i++
    ) {
      console.log("click");
      setTimeout(() => button.click(), i * 100);
    }
  }

  constructor(gridjsElement) {
    this.element = gridjsElement;
    this.searchElement = gridjsElement.querySelector(".gridjs-search-input");
  }

  appendInputElements(anchorHanders) {
    Object.entries(anchorHanders).forEach(([id, handler]) => {
      const input = document.createElement("input");
      input.addEventListener("focus", () => {
        input.checked = true;
        handler(this);
      });

      input.type = "radio";
      input.id = id;
      input.name = "project-table-preset";

      const a = document.querySelector(`a[href$='#${id}']`);
      a.href = "#" + id;
      a.after(input);
    });
  }
}

const FOCUS_HANDLERS = {
  ["importance-5"](self) {
    self.fireSearchEvent("importance-5");
  },
  ["latest"](self) {
    self.fireSearchEvent("crowdworks");
  },
  ["duration"](self) {
    self.setSort("duration", "desc");
    self.fireSearchEvent("");
  },
  ["cloud"](self) {
    self.setSort("period", "asc");
    self.fireSearchEvent("aws");
  }
};

const appendGridjs = (golangTable = document.querySelector(".project-table")) =>
  renderGridjsData(buildData(golangTable))
    .then((gridjsTable) => {
      golangTable.replaceWith(gridjsTable);
      const manipulator = new GridjsManipulator(gridjsTable);
      manipulator.appendInputElements(FOCUS_HANDLERS);
    })
    .catch((error) => {
      console.error(error);
      golangTable.prepend("Error: " + error.message);
      golangTable.style.display = "unset";
    });

appendGridjs();
