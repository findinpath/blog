---
title: Cucumber spring-retry test specifications 
tags: ["cucumber", "spring-retry", "spring-aop", "wiremock"]
cover: spring-retry-cucumber.jpg
author: findinpath
---


This post is intended to be heads up on the benefits in the readability
of the test scenarios that come when using
[Cucumber](https://github.com/cucumber/cucumber-jvm) library.


<re-img src="spring-retry-cucumber.jpg"></re-img>

The Github project [spring-retry-cucumber](https://github.com/findinpath/spring-retry-cucumber) 
which accompanies this blog post represents a simplisting Github API client that exposes operations 
for retrieving Github user details.

Feel free to checkout the source code of the project and run the tests by using the command:

```bash
mvn clean test
```

Below is presented a simple [demo](https://github.com/findinpath/spring-retry-cucumber/blob/master/src/main/java/com/findinpath/DemoApplication.java) of the functionality of this Github API client.


```java
    var config = new GithubProperties("https://api.github.com/");
    var github = new Github(config);
    var usersEndpoint = github.users();

    System.out.println(usersEndpoint.getUser("findinpath"));
    System.out.println(usersEndpoint.getUsers(0));
```

In case that sporadic exceptions may occur on the Github API, 
through the usage of the [spring-retry](https://github.com/spring-projects/spring-retry) mechanism 
built on top of the previously demoed Github API client,these failures should go unnoticed 
in the client program flow.

The program flow will retrieve successfully the user details even though sometimes one sporadic
API call will fail, because the API call will be retried and therefor in the client context,
the API call will appear as successful (even though it was actually performed twice).


## Cucumber

[Cucumber](https://cucumber.io/docs/guides/) is a software library that enables the usage of [Behaviour Driven Development](https://cucumber.io/docs/bdd/) in the projects where it is integrated.

[Gherkin](https://cucumber.io/docs/gherkin/) is a core component for Cucumber responsible 
for parsing the executable test specifications is .
Gherkin is a set of grammar rules that makes plain text structured enough for Cucumber to understand.

Below can be seen the accuracy & failure test scenarios written for the [spring-retry-cucumber](https://github.com/findinpath/spring-retry-cucumber) demo project.


<re-img src="accuracy-test-scenarios.png"></re-img>

<re-img src="failure-test-scenarios.png"></re-img>


When having a quick look over the scenarios above, it gets strikingly clear how the Github API
client is expected to work.

The demo project [spring-retry-cucumber](https://github.com/findinpath/spring-retry-cucumber)
has a few particularities in terms of usage for the [Cucumber](https://github.com/cucumber/cucumber-jvm)
framework which will be detailed in the lines below.

#### Support for custom parameter types

In the images above that showcase the accuracy & failures test scenarios for the 
Github API client, in the scenario steps, there are used the highlighted tokens:

- `GET` (corresponds to `RequestMethod.GET`)
- `INTERNAL_SERVER_ERROR` (corresponds to `HttpStatus.INTERNAL_SERVER_ERROR`)

In the scenario steps they are referenced in the following manner:

`WireMockApiSteps.java`
```java
  @Then("I have made {int} {requestMethod} calls made towards Github API {string} resource")
  public void checkNumberOfApiCalls(int count, RequestMethod requestMethod, String uri) {
    // ...
```

`UserSteps.java`
```java
  @Then("I will receive an {httpStatus} response status instead of the user details")
  public void checkErroneousCall(HttpStatus httpStatus) {
    // ...
```


[Gherkin](https://cucumber.io/docs/gherkin/) allows the registration of custom parameter
types. See below the corresponding code for registering the custom parameter types:

`ParameterTypes.java`
```java
    typeRegistry.defineParameterType(new ParameterType<>(
        "requestMethod", // name
        "GET|POST|PUT|DELETE", // regexp
        RequestMethod.class, // type
        (io.cucumber.cucumberexpressions.Transformer<RequestMethod>) s -> {
          RequestMethod requestMethod;
          if ("GET".equals(s)) {
            requestMethod = RequestMethod.GET;
          } else if ("POST".equals(s)) {
            requestMethod = RequestMethod.POST;
          } else if ("PUT".equals(s)) {
            requestMethod = RequestMethod.PUT;
          } else if ("DELETE".equals(s)) {
            requestMethod = RequestMethod.DELETE;
          } else {
            throw new IllegalArgumentException("Unknown value " + s + " for RequestMethod");
          }
          return requestMethod;
        }
    ));

    var regexpHttpStatus = Arrays.stream(HttpStatus.values()).map(Enum::name)
        .collect(Collectors.joining("|"));
    typeRegistry.defineParameterType(new ParameterType<>(
        "httpStatus", // name
        regexpHttpStatus, // regex
        HttpStatus.class, // type
        (io.cucumber.cucumberexpressions.Transformer<HttpStatus>) HttpStatus::valueOf
    ));

```

#### Data tables

[Data tables](https://cucumber.io/docs/gherkin/reference/#data-tables) is a feature
of Gherkin through which can be elegantly wrapped related values as objects 
in order to be passed the step definitions: 

`AccuracyCases.feature`
```cucumber
    Given I have configured the responses for the Github API
      | uri               | httpStatus | payloadFile                      |
      | /users/findinpath | 200        | api/github/users/findinpath.json |
```

`WireMockApiSteps.java`
```java
  @Given("I have configured the responses for the Github API")
  public void configureApiResponses(List<GithubApiResponse> responseList) {
    // ...
  }

  // ...

  public static class GithubApiResponse {

    private String uri;
    private int httpStatus;
    private String payloadFile;

    // ...
```



### Cucumber Spring Integration

[Cucumber](https://github.com/cucumber/cucumber-jvm) integration with [spring](https://spring.io/) framework has a few tweaks are worth mentioning in the lines below.

The `CommonSteps.java` class is the only one annotated with `@SpringBootTest` annotation.
This is one of the limitations imposed by the Cucumber framework in the ingration
with the [spring](https://spring.io/) framework.

```java
@SpringBootTest(classes = SpringDemoTestApplication.class)
@ActiveProfiles("test")
public class CommonSteps {
  //...
}
```

The step definition classes, the so-called "glue" to the test code get their dependendant spring beans
injected by using the `@Autowired` annotation on the constructor of the step class.
Below is presented the code of `UserSteps` class constructor for showcasing this particularity:

```java
  @Autowired
  public UserSteps(UsersEndpoint usersEndpoint,
      UserSharedScenarioData userSharedScenarioData) {
    this.usersEndpoint = usersEndpoint;
    this.userSharedScenarioData = userSharedScenarioData;
  }
```

## WireMock

The library [WireMock](http://wiremock.org/) is being used in the tests in order to be able to mock the Github API. 

Particularly useful, in case of failure tests, was the [Stateful Behavior](http://wiremock.org/docs/stateful-behaviour/) for being able to simulate failures and recoveries when calling the mock API
for a specific endpoint. The relevant code from `WireMockApiSteps.java` for configuring the mocked
Github API responses is presented below:

```cucumber
    Given I have configured the responses for the Github API
      | uri               | httpStatus | payloadFile                      |
      | /users/findinpath | 500        |                                  |
      | /users/findinpath | 200        | api/github/users/findinpath.json |
```


```java
  @Given("I have configured the responses for the Github API")
  public void configureApiResponses(List<GithubApiResponse> responseList) {
    var server = wireMockGithubApi.getWireMockServer();

    var responsesByUriMap = responseList
        .stream()
        .collect(Collectors.groupingBy(githubApiResponse -> githubApiResponse.getUri().trim()));

    responsesByUriMap.forEach((uri, uriResponseList) -> {
      for (int index = 0; index < uriResponseList.size(); index++) {
        var scenarioState =
            (index == 0) ? Scenario.STARTED : "Attempt " + (index + 1) + " for " + uri;

        var scenarioName = uri;
        var githubApiResponse = uriResponseList.get(index);
        var scenarioMappingBuilder = WireMock
            .get(WireMock.urlEqualTo(uri))
            .inScenario(scenarioName)
            .whenScenarioStateIs(scenarioState);
        if (index != uriResponseList.size() - 1) {
          scenarioMappingBuilder = scenarioMappingBuilder
              .willSetStateTo("Attempt " + (index + 2) + " for " + uri);
        }
        if (githubApiResponse.getHttpStatus() == HttpStatus.OK.value()) {
          var response = WireMock.aResponse()
              .withHeader("Content-Type", "application/json")
              .withStatus(githubApiResponse.getHttpStatus());
          if (githubApiResponse.getPayloadFile() != null) {
            response.withBodyFile(githubApiResponse.getPayloadFile());
          }
          server.stubFor(
              scenarioMappingBuilder
                  .willReturn(response)
          );
        } else {
          server.stubFor(
              scenarioMappingBuilder
                  .willReturn(
                      WireMock.aResponse()
                          .withHeader("Content-Type", "application/json")
                          .withStatus(githubApiResponse.getHttpStatus())
                  )
          );
        }
      }
    });
  }
```


Also very useful has proved to be the ability to browse through the requests made
towards the WireMock server.

```cucumber
    And I have made 2 GET calls made towards Github API "/users/findinpath" resource
    But I have a backoff delay between GET requests 1 and 2 made towards Github API "/users/findinpath" resource
```

Check more details on how to browse through the requests reaching WireMock Server on the blog post

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Browse the wiremock requests <a href="https://t.co/ze1neOa1CK">https://t.co/ze1neOa1CK</a></p>&mdash; findinpath (@findinpath) <a href="https://twitter.com/findinpath/status/1194939444501069824?ref_src=twsrc%5Etfw">November 14, 2019</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>


## Spring-retry

The [spring-retry](https://github.com/spring-projects/spring-retry) topic has already been
covered in a previous post. Check it out for seeing how to layer several [AOP](https://en.wikipedia.org/wiki/Aspect-oriented_programming) aspects on top of each other in order to get in-depth metrics
(including retries) on how much time external API call takes. 

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Add metrics to spring-retry functionality <a href="https://t.co/LYCuunrztT">https://t.co/LYCuunrztT</a></p>&mdash; findinpath (@findinpath) <a href="https://twitter.com/findinpath/status/1197271730424893443?ref_src=twsrc%5Etfw">November 20, 2019</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>


The spring-retry functionality is configured in the `github-api-aop-config.xml` file:

```xml
  <aop:config>
    <aop:pointcut id="github-api-calls"
      expression="execution(* com.findinpath.api.github.UsersEndpoint.*(..))  "/>

    <aop:advisor pointcut-ref="github-api-calls"
      advice-ref="githubApiRetryAdvice" order="1"/>

  </aop:config>
```



## Conclusions

As already mentioned in the Cucumber [documentation](https://cucumber.io/docs/bdd/) the main
benefits of using this libray for testing a software project are:


> * Encouraging collaboration across roles to build shared understanding of the the problem to be solved
> * Working in rapid, small iterations to increase feedback and the flow of value
> * Producing system documentation that is automatically checked against the system’s behaviour


Nevertheless, there are some drawbacks that have to be taken into account before integrating
Cucumber in your project:

* Poorly written tests can easily increase test-maintenance cost
* Cucumber is based (at the moment of this writing) on JUnit 4. Junit 5 will be supported with the upcoming release of Cucumber 5 (see on [Github](https://github.com/cucumber/cucumber-jvm/issues/1149) the _Add JUnit 5 Support_ issue)
* Cucumber tests are executed in a single-threaded fashion. This may be an incovenience for projects
having a lot of tests.


With all these things said, Cucumber is a very viable alternative for end to end tests because
it enables collaboration across all the roles in the project (software engineer, quality assurance, project management, requirements analyst) to build shared understanding of the the problem to be solve.