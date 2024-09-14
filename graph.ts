import db from './db.json' with { type: 'json' };
import * as d3 from 'd3';

interface Commit {
  commit: string;
  date: number;
  desc: string;
  data?: Record<string, unknown>;
  failed?: boolean;
}

interface Commit2 {
  date: Date;
  desc: string;
  size: number | undefined;
}

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
  const marginTop = 20;
  const marginRight = 20;
  const marginBottom = 30;
  const marginLeft = 80;

  const x = d3.scaleUtc()
    .domain(d3.extent(commits, d => d.date) as [Date, Date])
    .range([marginLeft, width - marginRight]);

  const y = d3.scaleLinear()
    .domain(d3.extent(commits, d => d.size) as [number, number])
    .range([height - marginBottom, marginTop])
    .nice();

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height);

  svg.append("g")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(d3.axisBottom(x));

  svg.append("g")
    .attr("transform", `translate(${marginLeft},0)`)
    .call(d3.axisLeft<number>(y).tickFormat(b => prettyBytes(b)).ticks(5));

  // line chart
  const line = d3.line<Commit2>()
    .defined(d => d.size != null)
    .x(d => x(d.date))
    .y(d => y(d.size as number))
    .curve(d3.curveStepAfter);
  svg.append("path")
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 1.5)
    .attr("d", line(commits));

  // dots
  svg.append('g')
    .attr("fill", "white")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 1)
    .selectAll("circle")
    .data(commits.filter(d => d.size != null))
    .join("circle")
    .attr("transform", d => `translate(${x(d.date)},${y(d.size as number)})`)
    .attr("r", 4)
    .on('mouseover', function (d, i) {
      d3.select(this)
        .attr("stroke-width", 2)
    })
    .on('mouseout', function (d, i) {
      d3.select(this)
        .attr("stroke-width", 1)
    });

  document.body.appendChild(svg.node()!);
}

main();