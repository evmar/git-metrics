import db from './db.json' with { type: 'json' };
import * as d3 from 'd3';

/** Commits as they come in from db.json. */
interface Commit {
  commit: string;
  date: number;
  desc: string;
  data?: Record<string, unknown>;
  failed?: boolean;
}

/** Commits after loading/preprocessing. */
interface Commit2 {
  date: Date;
  desc: string;
  size: number;
  delta: number;
}

/** Converts a byte count to a pretty '1.23 MB' string. */
function prettyBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs > 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)}mb`;
  }
  if (abs > 1024) {
    return `${(bytes / 1024).toFixed(0)}kb`;
  }
  return `${bytes}b`;
}

function main() {
  let dbCommits = db as Commit[];
  dbCommits.reverse();

  let last = 0;
  const commits: Commit2[] = dbCommits.map(c => {
    const size = (c.data?.size ?? last) as number;
    const delta = size - last;
    if (Math.abs(delta) < 2 * 1024) { return null }
    last = size;
    return {
      date: new Date(c.date * 1000),
      desc: c.desc,
      size,
      delta,
    }
  }).filter(d => d != null);

  // remove any initial commits with size 0
  for (let i = 0; i < commits.length; i++) {
    if (commits[i].size > 0) {
      commits.splice(0, i);
      break;
    }
  }

  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 30, left: 80 };

  const dateExtent = d3.extent(commits, d => d.date) as [Date, Date];
  const x = d3.scaleUtc()
    .domain([d3.timeDay.offset(dateExtent[0], -1), dateExtent[1]])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain(d3.extent(commits, d => d.size) as [number, number])
    .range([height - margin.bottom, margin.top])
    .nice();

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height);

  // x axis
  const gx = svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)

  // y axis
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft<number>(y).tickFormat(b => prettyBytes(b)).ticks(5));

  svg.append("clipPath")
    .attr("id", 'clip')
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", width - margin.left)  // note: margin.right omitted
    .attr("height", height - margin.top - margin.bottom);

  const clipped = svg.append("g")
    .attr("clip-path", 'url(#clip)');

  const path = clipped.append("path")
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 1.5);

  const dots = clipped.append('g')
    .attr("fill", "white")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 1)
    .selectAll("circle")
    .data(commits.filter(d => d.size != null))
    .join("circle")
    .attr("r", 4);

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  dots.on('mouseover', function (event, d) {
    d3.select(this)
      .attr("stroke-width", 2);
    tooltip
      .style("opacity", 1);
    tooltip.text(`${d.desc} (${d.delta >= 0 ? '+' : ''}${prettyBytes(d.delta)})`)
      .style("left", (event.pageX) + "px")
      .style("top", (event.pageY - 28) + "px");
  })
  dots.on('mouseout', function (event, d) {
    d3.select(this)
      .attr("stroke-width", 1);
    tooltip
      .style("opacity", 0);
  });

  function render(x: d3.ScaleTime<number, number>) {
    const line = d3.line<Commit2>()
      .defined(d => d.size != null)
      .x(d => x(d.date))
      .y(d => y(d.size as number))
      .curve(d3.curveStepAfter);
    path.attr('d', line(commits));
    dots.attr("transform", d => `translate(${x(d.date)},${y(d.size as number)})`)
    gx.call(d3.axisBottom(x));
  }
  render(x);

  const zoom = d3.zoom<SVGSVGElement, undefined>()
    .scaleExtent([1, 200])
    .extent([[margin.left, 0], [width - margin.right, height]])
    .translateExtent([[margin.left, -Infinity], [width - margin.right, Infinity]])
    .on("zoom", zoomed);
  function zoomed(event: d3.D3ZoomEvent<SVGSVGElement, undefined>) {
    const xz = event.transform.rescaleX(x);
    render(xz);
  }
  svg.call(zoom);

  document.body.appendChild(svg.node()!);
}

main();