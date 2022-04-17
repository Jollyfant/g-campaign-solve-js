const GSolve = function() {

  /*
   * Class GSolve
   * Wrapper for the application
   */

  this.data = null;

  document.getElementById("load-file").addEventListener("change", this.readFile.bind(this));
  document.getElementById("inversion-order").addEventListener("change", this.calculate.bind(this));
  document.getElementById("remove-drift").addEventListener("change", this.calculate.bind(this));
  document.getElementById("tare").addEventListener("change", this.calculate.bind(this));
  document.getElementById("tare-enabled").addEventListener("change", this.calculate.bind(this));
  document.getElementById("uncertainty-bars").addEventListener("change", this.calculate.bind(this));
  document.getElementById("demo").addEventListener("click", this.demo.bind(this));

  document.addEventListener('DOMContentLoaded', this.init.bind(this));

}

GSolve.prototype.VERSION = "0.0.1";
GSolve.prototype.DOI = "10.5281/zenodo.6466389";

GSolve.prototype.demo = function() {

  /*
   * Function GSolve.demo
   * Loads a demo file to display
   */

  fetch("./example-one.txt").then(response => response.text()).then(function(result) {
    this.parseFile({ result });
  }.bind(this));

}

GSolve.prototype.init = function(event) {

  /*
   * Function GSolve.init
   * Initializes the app with a version / DOI
   */

  document.getElementById("footer-info").innerHTML = "Version " + this.VERSION + " (" + this.DOI + ")";

}

GSolve.prototype.readFile = function(event) {

  /*
   * Function GSolve.readFile
   * Reads a file from disk and sets the data in the class
   */

  let reader = new FileReader();
  let file = event.target.files[0];

  this.filename = file.name;

  reader.onload = this.parseFile.bind(this, reader);
  reader.readAsText(file);

}

GSolve.prototype.parseFile = function(reader) {

  /*
   * Function GSolve.parseFile
   * Parses the data file
   */

  this.data = reader.result.split(/\r?\n/).filter(x => !x.startsWith("#")).map(this.parseRow, this);

  this.calculate();

}

GSolve.prototype.parseRow = function(row) {

  /*
   * Function GSolve.parseRow
   * Parses a single row inside the data file
   */

  let [ time, benchmark, value, error ] = row.split(",");
  
  return new Object({
    "time": Date.parse(time + "Z"),
    "benchmark": benchmark,
    "value": Number(value),
    "error": Number(error)
  })

}

GSolve.prototype.getDriftMatrix = function(times, degree) {

  /*
   * Function GSolve.getDriftMatrix
   * Returns the design matrix for the drift parameters (polynomial)
   */

  switch(degree) {
    case 1: return new Array(times, new Array(times.length).fill(1));
    case 2: return new Array(times.map(x => x ** 2), times, new Array(times.length).fill(1));
    case 3: return new Array(times.map(x => x ** 3), times.map(x => x ** 2), times, new Array(times.length).fill(1));
  }

}

GSolve.prototype.calculate = function() {

  /*
   * Function GSolve.calculate
   * Returns the design matrix for the drift parameters (polynomial)
   */

  if(this.data === null) {
    return;
  }

  // Settings
  let data = this.data;
  let degree = Number(document.getElementById("inversion-order").value);

  // Anchor is the first entry
  let anchor = this.data[0].benchmark;

  document.getElementById("anchor").innerHTML = anchor;
  let times = data.map(x => x.time);
  let timecorr = times[0];
  times = times.map(x => (x - timecorr) / 1000);

  // Matrix for drift parameters
  let dMatrix = this.getDriftMatrix(times, degree);

  let benchmarks = data.map(x => x.benchmark);

  // List of unique benchmarks
  let unique = Array.from(new Set(benchmarks.filter(x => x !== anchor)));

  // Add a degree of freedom for each benchmark
  unique.forEach(function(benchmark) {
    dMatrix.push(this.getGravityDesignMatrixColumn(benchmark, benchmarks));
  }, this);

  // Handle tares
  let tare = Number(document.getElementById("tare").value);
  tare = Math.min(Math.max(0, tare), times.length);
  let tareArray;

  if(document.getElementById("tare-enabled").checked && tare > 0 && tare < times.length) {
    tareArray = times.map((x, i) => i < tare ? 0 : 1);
    dMatrix.push(tareArray);
  }

  // Transpose
  gMatrix = math.transpose(dMatrix);

  // Weiht matrix
  let wMatrix = math.diag(data.map(x => (1 / x.error ** 2)));

  // Values from mGal to uGal
  let values = data.map(x => 1000 * x.value);

  // Complete the inversion with the design, weight matrix and values
  let { lsq, std } = this.invert(gMatrix, wMatrix, values);

  // Poly parameters
  let polynomial = lsq.slice(0, degree + 1);

  // Gravity parameters
  let dgs = lsq.slice(degree + 1);
  let stds = std.slice(degree + 1);

  // Create a lookup for the solution: add anchor by default
  let lookup = new Object({
    [anchor]: {"dg": 0, "stds": 0}
  });

  // Add solutions
  unique.forEach(function(key, i) {
    lookup[key] = new Object({
      "dg": dgs[i],
      "stds": stds[i]
    });
  });

  // Sort and plot
  let sep = unique.sort();
  sep.unshift(anchor);

  let tareOffset;

  if(document.getElementById("tare-enabled").checked && tare > 0 && tare < times.length) {
    tareOffset = tareArray.map(x => x * lsq[lsq.length - 1]);
  } else {
    tareOffset = new Array(times.length).fill(0);
  }

  this.plotRaw(data, sep);
  this.plotSolution(data, times, sep, lookup, polynomial, timecorr, tareOffset, tare);

  // Show
  document.getElementById("graphs").style.display = "block";
  document.getElementById("information").style.display = "none";

}

GSolve.prototype.getInterpolatedPolynomial = function(polynomial, max, timecorr) {

  /*
   * Function GSolve.calculate
   * Returns the design matrix for the drift parameters (polynomial)
   */

  // One dot per minute
  let nPoints = Math.round(max / (60));

  let interpolated = new Array();

  for(let i = 0; i < nPoints; i++) {

    let x = (i * (60));
    interpolated.push({"x": (timecorr + 1000 * x), "y": this.interp(polynomial, x)});

  }

  return interpolated;

}

GSolve.prototype.invert = function(dmatrix, wmatrix, values) {

  /*
   * Function GSolve.invert
   * Completed the WLS inversion
   */

  // Solutions
  let N = math.inv(math.multiply(math.transpose(dmatrix), wmatrix, dmatrix));
  let lsq = math.multiply(N, math.transpose(dmatrix), wmatrix, values);

  // Variance
  let dof = values.length - lsq.length - 1;
  let residuals = math.subtract(values, math.multiply(dmatrix, lsq));
  let chi = math.multiply(math.transpose(residuals), wmatrix, residuals);
  let res = math.multiply(chi / dof, N);

  // These are standard deviations
  let std = math.sqrt(math.diag(res));

  return { lsq, std }
  
}

GSolve.prototype.getGravityDesignMatrixColumn = function(benchmark, benchmarks) {

  /*
   * Function GSolve.getGravityDesignMatrixColumn
   * Returns row in the design matrix for one benchmark
   */

  return benchmarks.map(x => (x === benchmark) ? 1 : 0);

}

GSolve.prototype.plotRaw = function(data, as) {

  /*
   * Function GSolve.plotRaw
   * Plots the raw occupations
   */

  let series = Array.from(as).map(function(benchmark) {

    let points = data.filter(x => x.benchmark === benchmark).map(function(x) {

      return new Object({
        "x": x.time,
        "y": 1000 * x.value
      });

    });

    return new Object({
      "name": benchmark,
      "marker": {
        "symbol": "circle",
        "lineWidth": 1,
        "lineColor": "black"
      },
      "zIndex": 2,
      "data": points
    });

  });

  Highcharts.chart("container-raw", {
    "chart": {
      "animation": false,
      "type": "scatter",
    },
    "title": {
      "text": "Benchmark Occupations"
    },
    "yAxis": {
      "title": {
        "text": "Microgravity (μGal)"
      }
    },
    "xAxis": {
      "type": "datetime"
    },
    "tooltip": {
      "formatter": function () {
        return "Benchmark <b>" + this.series.name + "</b><br> Gravity Value: " + this.y + "μGal";
      }
    },
    "exporting": {
      "buttons": {
        "contextButton": {
          "menuItems": ["downloadPNG", "downloadJPEG", "downloadPDF", "downloadSVG"],
        }
      }
    },
	"plotOptions": {
	  "series": {
	    "animation": false
	  }
	},
    "credits": {
      "enabled": false
    },
    "series": series
  });

}

GSolve.prototype.interp = function(polynomial, x) {
 
  /*
   * Function GSolve.interp
   * Interpolates on the polynomial
   */

  let sum = 0;

  for(let i = polynomial.length - 1; i >= 0; i--) {
    sum += polynomial[i] * x ** ((polynomial.length - 1) - i);
  }

  return sum;

}

GSolve.prototype.handleExport = function() {

  /*
   * Function GSolve.handleExport
   * Handles the .CSV exporting of a gravity data file
   */

   let csv = this.series.slice(0, this.series.length - 1).map(function(x) {
     return new Array(x.options.benchmark, Math.round(x.options.dg), Math.round(x.options.std)).join(",");
   })
  
   csv.unshift(["Benchmark", "Gravity Difference (\u03BCGal)", "2\u03C3 Confidence Interval (\u03BCGal)"].join(","));
   csv.unshift(["Input", G.filename].join(","))
   csv.unshift(["Version", GSolve.prototype.VERSION].join(","))
   csv.unshift(["Exported", new Date().toISOString().substring(0, 19)].join(","))

   let blob = new Blob([csv.join("\n")]);
   let a = window.document.createElement("a");
   a.href = window.URL.createObjectURL(blob, {type: "text/csv;charset=utf-8"});
   a.download = "gravity-results.csv";
   document.body.appendChild(a);
   a.click();
   document.body.removeChild(a);

}

GSolve.prototype.plotSolution = function(data, times, as, lookup, polynomial, timecorr, tareOffset, tare) {

  /*
   * Function GSolve.plotSolution
   * Plots the recovered inverted solution
   */

  let shouldSubtractDrift = document.getElementById("remove-drift").checked;

  let polyLineData = this.getInterpolatedPolynomial(polynomial, times[times.length - 1], timecorr);
  let driftPerSecond = polynomial[polynomial.length - 2];

  let correct = true;
  let series = new Array();
  let tares = new Array();

  Array.from(as).forEach(function(benchmark) {

    let dg = lookup[benchmark].dg;
    let uncertainty = Math.round(2 * lookup[benchmark].stds);

    let points = new Array();
    let errors = new Array();

    data.forEach(function(x, i) {

      if(x.benchmark !== benchmark) {
        return;
      }

      let value = 1000 * x.value - dg - tareOffset[i];

      if(shouldSubtractDrift) {
        value -= this.interp(polynomial, (x.time - timecorr) / 1000);
      }

      value = Math.round(value);

      if(tareOffset[i] !== 0) {
        tares.push(new Object({
          "x": x.time,
          "y": value + tareOffset[i]
        }));
      }

      points.push(new Object({
        "x": x.time,
        "y": value
      }));

      errors.push(new Object({
        "x": x.time,
        "y": value - uncertainty,
      }));

      errors.push(new Object({
        "x": x.time,
        "y": value + uncertainty
      }));

      errors.push([x.time, null]);

    }, this);

    series.push(new Object({
      "type": "scatter",
      "dg": dg,
      "benchmark": benchmark,
      "std": uncertainty,
      "name": benchmark === as[0] ? benchmark : benchmark + " (" + Math.round(dg) + "±" + uncertainty + ")",
      "marker": {
        "symbol": "circle",
        "lineWidth": 1,
        "lineColor": "black"
      },
      "zIndex": 2,
      "data": points
    }));

    if(document.getElementById("uncertainty-bars").checked) {
      series.push(new Object({
        "linkedTo": ":previous",
        "type": "line",
        "zIndex": 1,
        "lineWidth": 2,
        "color": "grey",
        "data": errors
      }));
    }

  }, this);

  // Plot horizontal line at 0
  if(shouldSubtractDrift) {
    polyLineData = new Array({"x": data[0].time, "y": 0}, {"x": data[data.length - 1].time, "y": 0});
  }

  let plotBands = new Array();

  // Add a plot band for the tare	
  if(document.getElementById("tare-enabled").checked && tare > 0 && tare < times.length) {

    plotBands.push({
      "color": "rgba(255, 0, 0, 0.1)",
      "from": timecorr + times[tare] * 1000,
      "to": timecorr + times[times.length - 1] * 1000
    });

    series.push({
      "name": "Tare (" + Math.round(tareOffset[tare]) + "μGal)",
      "type": "scatter",
      "color": "white",
      "marker": {
        "symbol": "circle",
        "lineColor": "red",
        "lineWidth": 1
      },
      "data": tares,
      "events": {
        "legendItemClick": function() {
          if(this.visible) {
            this.chart.xAxis[0].update({
              plotBands: []
            });
          } else {
            this.chart.xAxis[0].update({
              plotBands: plotBands
            });
          }
        }
      }
    });

  }

  series.push({
    "type": "line",
    "name": "Drift (" + Math.round(86400 * driftPerSecond) + "μGal/d) - Order " + (polynomial.length - 1),
    "color": "red",
    "dashStyle": "LongDash",
    "marker": {
      "enabled": false
    },
    "enableMouseTracking": false,
    "zIndex": 1,
    "data": polyLineData
  });

  Highcharts.chart("container-solved", {
    chart: {
        "animation": false,
        "type": "scatter",
    },
    "title": {
      "text": "Inversion Results"
    },
    "yAxis": {
      "title": {
        "text": "Microgravity (μGal)"
      }
    },
    "xAxis": {
      "type": "datetime",
      "plotBands": plotBands,
    },
    "exporting": {
        "menuItemDefinitions": {
            "downloadCSV": {
                "onclick": this.handleExport,
                "text": "Download CSV data file"
            }
        },
      "buttons": {
        "contextButton": {
          "menuItems": ["downloadPNG", "downloadJPEG", "downloadPDF", "downloadSVG", "downloadCSV"],
        }
      }
    },
    "tooltip": {
      formatter: function () {
        if(shouldSubtractDrift) {
          return "Benchmark <b>" + this.series.name + "</b><br> Gravity Residual: " + Math.round(this.y) + "μGal";
        } else {
          return "Benchmark <b>" + this.series.name + "</b><br> Gravity Value: " + Math.round(this.y) + "μGal";
        }
      }
    },
    "plotOptions": {
	  "series": {
	   "animation": false
	  }
    },
    "credits": {
      "enabled": false
    },
    "series": series
  });

}

let G = new GSolve();