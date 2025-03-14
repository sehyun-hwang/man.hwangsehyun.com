import { Grid, html } from 'gridjs';

/* eslint-disable */
// Start
function buildData(golangTable) {
  window.golangTable = golangTable;
  console.log(golangTable.tBodies);
  const data = Array.from(
    golangTable.tBodies,
    ({
      rows: [
        { cells },
        {
          cells: [cell]
        }
      ]
    }) =>
      Array.prototype.flatMap.call([...cells, cell], (cell) => {
        if (cell.classList.contains("number")) return Number(cell.textContent);
        const period = cell.classList.contains("period");
        if (!period) return cell;
        const [{ dateTime: start }, { dateTime: end }] = cell.querySelectorAll(
          "time"
        );
        return [start + "_" + end, new Date(end) - new Date(start)];
      })
  );
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

  "Belonging",

  {
    name: "Period",
    sort: true,
    attributes: (cell) => ({
      class: cell ? "gridjs-td period monospace" : "gridjs-th"
    }),
    formatter: (data) => {
      const [start, end] = data.split("_").map((date) => new Date(date));
      return start.toLocaleDateString() + " ~ " + end.toLocaleDateString();
    }
  },

  {
    name: "Duration",
    sort: true,
    formatter(data) {
      const months = data / 1000 / 3600 / 24 / 30;
      return html(`<span class="chip">${months.toFixed(1)} Months</span>`);
    }
  },

  "Technologies",

  {
    name: "Importance",
    hidden: true
  },

  {
    name: "Description",
    attributes: (cell) => {
      return {
        class: cell ? "gridjs-td truncated" : "gridjs-th"
      };
    }
  }
];

async function renderGridjsData(data) {
  const section = document.createElement("section");
  section.classList.add("project-table");
  const grid = new Grid({
    resizable: false,
    autoWidth: false,
    search: true,
    columns,
    data,
    className: {
      tbody: "post-content"
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

const newspaperSpinning = [
  {
    borderColor: "#9bc2f7",
    boxShadow: "0 0 0 3px rgba(149,189,243,.5)"
  },
  {
    borderColor: "unset",
    boxShadow: "unset"
  }
];

const newspaperTiming = {
  duration: 500,
  iterations: 2
};

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
    console.log('Setting sort', { id, direction });
    const DIRECTION_SEQUENCE = ["neutral", "asc", "desc"];
    const button = this.element.querySelector(
      `.gridjs-th[data-column-id='${id}'] .gridjs-sort`
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
    const search = this.element.querySelector(".gridjs-search-input");

    Object.entries(anchorHanders).forEach(([id, handler]) => {
      const selector = `a[href$='#${id}']`;
      const a = document.querySelector(selector);
      if (!a) return console.warn("Selector not found" + selector);
      a.href = "#" + id;

      const input = document.createElement("input");
      input.addEventListener("focus", () => {
        input.checked = true;
        search.animate(newspaperSpinning, newspaperTiming);
        handler(this);
      });
      input.type = "radio";
      input.id = id;
      input.name = "project-table-preset";

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
      // @TODO Wait for support
      gridjsTable.querySelectorAll("tr")
        .forEach((x) => x.style.breakInside = "avoid");
      golangTable.replaceWith(gridjsTable);
      const manipulator = new GridjsManipulator(gridjsTable);
      manipulator.appendInputElements(FOCUS_HANDLERS);
    })
    .catch((error) => {
      console.error(error);
      golangTable.prepend("Error: " + error.message);
      golangTable.style.display = "unset";
    });

/* eslint-enable */

new URLSearchParams(window.location.search).has('print') || appendGridjs();
