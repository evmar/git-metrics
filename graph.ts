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
  size: number | undefined;
}

/** Converts a byte count to a pretty '1.23 MB' string. */
function prettyBytes(bytes: number): string {
  if (bytes > 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  if (bytes > 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

function main() {
  let dbCommits = db as Commit[];
  dbCommits.reverse();
  //commits = commits.filter(c => c.data?.size != null);
  const commits: Commit2[] = dbCommits.map(c => ({ date: new Date(c.date * 1000), desc: c.desc, size: c.data?.size as number | undefined }));

  const width = 640;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 30, left: 80 };

  const x = d3.scaleUtc()
    .domain(d3.extent(commits, d => d.date) as [Date, Date])
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
    .attr("width", width - margin.left - margin.right)
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
    tooltip.transition()
      .duration(100)
      .style("opacity", 1);
    tooltip.html(d.desc)
      .style("left", (event.pageX) + "px")
      .style("top", (event.pageY - 28) + "px");
  })
  dots.on('mouseout', function (event, d) {
    d3.select(this)
      .attr("stroke-width", 1);
    tooltip.transition()
      .duration(100)
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