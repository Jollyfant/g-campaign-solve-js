const GSolve = function() {

  /*
   * Class GSolve
   * Wrapper for the application
   */

  this.data = null;

  document.getElementById("load-file").addEventListener("change", this.readFile.bind(this));
  document.getElementById("inversion-order").addEventListener("change", this.calculate.bind(this));
  document.getElementById("remove-drift").addEventListener("change", this.calculate.bind(this));

}


GSolve.prototype.readFile = function(event) {

  /*
   * Function GSolve.readFile
   * Reads a file from disk and sets the data in the class
   */

  let reader = new FileReader();

  reader.onload = this.parseFile.bind(this, reader);
  reader.readAsText(event.target.files[0]);

}

GSolve.prototype.parseFile = function(reader) {

  /*
   * Function GSolve.parseFile
   * Parses the data file
   */

  this.data = reader.result.split(/\r?\n/).map(this.parseRow, this);

  this.calculate();

}

GSolve.prototype.parseRow = function(row) {

  /*
   * Function GSolve.parseRow
   * Parses a single row inside the data file
   */

  let [ time, benchmark, value, error ] = row.split(",");
  
  return new Object({
    "time": Date.parse(time),
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
  let times = data.map(x => x.time);
  let timecorr = times[0];
  times = times.map(x => (x - timecorr) / 1	000);

  // Matrix for drift parameters
  let dMatrix = this.getDriftMatrix(times, degree);

  let benchmarks = data.map(x => x.benchmark);

  // List of unique benchmarks
  let unique = Array.from(new Set(benchmarks.filter(x => x !== anchor)));

  // Add a degree of freedom for each benchmark
  unique.forEach(function(benchmark) {
    dMatrix.push(this.getGravityDesignMatrixColumn(benchmark, benchmarks));
  }, this);

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

  this.plotRaw(data, sep);
  this.plotSolution(data, times, values, sep, lookup, polynomial, timecorr);

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

GSolve.prototype.plotSolution = function(data, times, values, as, lookup, polynomial, timecorr) {

  /*
   * Function GSolve.plotSolution
   * Plots the recovered inverted solution
   */

  let shouldSubtractDrift = document.getElementById("remove-drift").checked;

  let polyLineData = this.getInterpolatedPolynomial(polynomial, times[times.length - 1], timecorr);
  let driftPerSecond = polynomial[polynomial.length - 2];

  let correct = true;

  let series = Array.from(as).map(function(benchmark) {

    let dg = Math.round(lookup[benchmark].dg);
    let uncertainty = Math.round(2 * lookup[benchmark].stds);

    let series = data.filter(x => x.benchmark === benchmark).map(function(x) {

      let value = 1000 * x.value - dg;

      if(shouldSubtractDrift) {
        value -= this.interp(polynomial, (x.time - timecorr) / 1000);
      }

      return new Object({
        "x": x.time,
        "y": value
      });

    }, this);

    return new Object({
      "name": benchmark + " (" + dg + "±" + uncertainty + ")",
      "marker": {
        "symbol": "circle",
        "lineWidth": 1,
        "lineColor": "black"
      },
      "zIndex": 2,
      "data": series
    });

  }, this);

  // Plot horizontal line at 0
  if(shouldSubtractDrift) {
    polyLineData = new Array({"x": data[0].time, "y": 0}, {"x": data[data.length - 1].time, "y": 0});
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
        "type": "datetime"
      },
      "tooltip": {
          formatter: function () {
              if(rem) {
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