---
title: Browse the requests made towards WireMock
tags: ["wiremock"]
cover: wiremock.jpg
author: findinpath
---

This post showcases how to browse/filter the requests made towards [Wiremock](http://wiremock.org/).

<re-img src="wiremock.jpg" title="WireMock"></re-img>


When doing integration tests that involve one or more external APIs, it is worth considering
a mock server for the job. 

Some of the advantages of using such a server is that it:

 - always performs as configured (even the delay for a API response can be in detail configured)
 - doesn't have downtimes while the tests are being executed

Obviously, there are downsides when using a mock server for any testing scenario. It is
advisable that for end to end tests to use the actual external APIs instead of the mocked versions
of them in order to avoid discovering regression issues only in production.

[WireMock](http://wiremock.org/) is one of the best libraries that act as a simulator for 
HTTP-based APIs. It can be executed from a [Junit](https://junit.org/) test, as well as 
a standalone application.


WireMock offers the ability to browse through the requests made towards it and on top of 
this functionality there can be made assertions. This functionality can
come in handy in several test scenarios.

Verify that a specific API endpoint has been called only once

```java
wiremockServer.verify(1, postRequestedFor(urlEqualTo("api/order")));
``` 

Verify the order in which the API calls are made

```java
var paymentRequests = wiremockServer.findAll(postRequestedFor(urlMatching("/api/payment")));
var shipmentRequests = wiremockServer.findAll(postRequestedFor(urlMatching("/api/shipment")));
// shipment shouldn't happen before payment
assertThat(shipmentRequests.get(0).getLoggedDate(), greaterThan(paymentRequests.get(0).getLoggedDate());
```



In case that a certain test needs a more complex handling (e.g. : callbacks in the test code) for 
specific requests, WireMock also provides a series of instruments that can be used to 
extend its basic functionality:

- `com.github.tomakehurst.wiremock.extension.requestfilter.RequestFilter`
- `com.github.tomakehurst.wiremock.extension.PostServeAction`
- `com.github.tomakehurst.wiremock.extension.ResponseDefinitionTransformer`

Complex needs in the tests can be covered when registering a concrete implementation of 
the classes above as an extension for the WireMock server.


The java project [wiremock-recorded-request-timestamp](https://github.com/findinpath/wiremock-recorded-request-timestamp)
provides a runnable example on how to retrieve the logged date of the requests made towards 
the WireMock server. 

Simply use `mvn clean install` for trying out the project.
