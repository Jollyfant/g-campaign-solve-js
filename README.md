﻿# Microgravity Solver

[Web application](https://jollyfant.github.io/g-campaign-solve-js/) to solve for microgravity differences in campaign gravimetry. The application uses a OLS or WLS inversion (e.g., [Hwang et al., 2002](https://doi.org/10.1016/S0098-3004(02)00005-5)) to solve for instrumental drift and gravity differences at the same time, including an optional tare. Example data are provided with the application, but your own data can be added in CG-5 or CG-6 format.

# Adding Data

In the top-right options panel, select the right input format from the drop-down menu. Then click *Select File* to load the data file from disk.

# Selecting Data

Once loaded to the application, individual data points can be toggled on / off by clicking them in the top chart. This may be helpful to eliminate poor measurements manually to observe the effects on the result.

# Anchor

Each benchmark can be selected to be the anchor, the benchmark through which all other recovered gravity differences are expressed.

# Drift

A polynomial drift can be imposed on the data, allowing an order from 1 to 3. Overfitting a high polynomial will cause instability and have an effect on the uncertainties of the results.

# Microgravity Corrections (Tide)

Corrections are generally **not** applied to the data, and the application works with the raw microgravity values provided. The option *Correct Tide* works by applying (or removing) the tidal correction column in the CG-5 and CG-6 data files. It is not available for other formats as it does not rely on a solid earth tidal model (e.g., TSOFT, ETERNA).

# Tare Restoration

An optional data tare can be configured by selecting the *Tare Offset* option. **Note:** the offset represents the sample offset, not the offset in microGal! The group of data after the tare is given an additional degree of freedom in the WLS inversion, allowing it to align with the imposed drift model; effectively restoring the tare automatically.

# Uncertainties

The provided uncertainties (2 sigma) are effectively based on the remaining residuals from the imposed drift model. These are often much lower than the standard deviations of the microgravity measurements.

# Citing

This specific version of the application has a DOI: [10.5281/zenodo.6466389](10.5281/zenodo.6466389). We kindly remind you to cite all sources.
