---
title: Timing spring-data-cassandra repository methods
tags: ["cassandra", "micrometer", "spring-boot", "aspectj", "testcontainers"]
cover: harry-sandhu-FpYoDqGGI4A-unsplash.jpg
author: findinpath
---

This post showcases how to make use of Spring AOP / AspectJ for timing the
duration of both synchronous and asynchrnous methods belonging to 
[spring data cassandra](https://spring.io/projects/spring-data-cassandra) repositories.

<re-img src="harry-sandhu-FpYoDqGGI4A-unsplash.jpg" title="Photo by Harry Sandhu on Unsplash"></re-img>

## Metrics in the data access layer of the application


Having an overview on the [Prometheus](https://prometheus.io/) for how each of the operations
exposed by the _Data Access Layer_ performs is a tremendous improvement
for monitoring and tackling production issues on a live application.

To give a pretty common example, say that with a new release of the application 
one `SELECT` statement from a repository class gets changed that causes the
application to run normal on the testing environment, but on the productive environment
where there's much more data to perform much worse than it did before.
In that case after the release, the [Quality of Service](https://en.wikipedia.org/wiki/Quality_of_service)
will drop to a significant amount, and the engineer responsible for the release
will need to investigate what has changed for the worse since the last release.

This is where nowadays metric collector services (like [Prometheus](https://prometheus.io/))
shine and provide a lot of meaningful answers in such situations.
It would obviously be very helpful to see in [Grafana](https://grafana.com/) 
or even receive a [Prometheus alert](https://prometheus.io/docs/practices/alerting/)
whether an operation or a set of operations performed by the application performs
much more slowly than before.

Seeing a continuous increase of average duration or 
repeated failures on the data access layer for a
certain operation from a repository in the data access layer of the application
since the last release would help to identify very fast 
the problem and subsequently revert the change or fix the problem.


## Timing the methods of spring data repositories

When using the `io.micrometer.core.annotation.Timed` annotation that comes 
with [micrometer](https://micrometer.io/) library in a 
[spring-boot](https://spring.io/projects/spring-boot) application
there is obtained the emission of timing metrics for the methods annotated
with this annotation.

When annotating the class with the `@Timed` annotation, all the public methods 
of the spring bean class will be timed. 

This seems like a good solution, but very often it happens that through 
omission/refactoring in the code, the annotation is being removed by mistake
from the class and therefore the valuable metrics and not emitted anymore
to the micrometer's `MeterRegistry`.
 
Another drawback of the `io.micrometer.core.annotation.Timed` annotation
(and the `io.micrometer.core.aop.TimedAspect` which takes care of intercepting
the methods annotated with `Timed` annotation) is that it doesn't have support
for dealing with asynchronous methods.

Through [spring data cassandra](https://spring.io/projects/spring-data-cassandra) utility classes:

- `org.springframework.data.cassandra.core.CassandraTemplate`
- `org.springframework.data.cassandra.core.AsyncCassandraTemplate`

there can be executed statements on the Cassandra database in both fashions, 
synchronous and asynchronous.

The project [spring-data-cassandra-repository-methods-timing](https://github.com/findinpath/spring-data-cassandra-repository-methods-timing)
developed a custom [AspectJ](https://en.wikipedia.org/wiki/AspectJ) class
for taking care of timing all the public methods exposed by the spring data repository bean
classes from the project.

Spring data repository classes are considered any of the following:

- the class is annotated with the `@org.springframework.stereotype.Repository` annotation
- the class implements `org.springframework.data.repository.Repository` class
  
  
In a similar fashion to the  micrometer's `io.micrometer.core.aop.TimedAspect`, the
AspectJ `com.findinpath.aop.RepositoryTimerAspect` class from the proof of concept project intercepts
the methods of spring data repository beans from the project and emits timer information
to micrometer's `io.micrometer.core.instrument.MeterRegistry`.

The information get emitted to the micrometer metric named `repository` with the following tags:

```java
.tags("class", className) 
.tags("method", methodName)
.tags("successful", successful) 
```

The `className` can be on of the following:

- the interface corresponding to the repository - 
see `com.findinpath.repository.ConfigRepository`
- the concrete class annotated with `@org.springframework.stereotype.Repository` 
annotation - see `com.findinpath.repository.UserBookmarkRepository`


The `successful` flag states whether the call was or not successfully executed.


### Dealing with asynchronous methods

As mentioned earlier, there can be executed asynchronous methods on Cassandra.
The implementation of the asynchronous methods with spring data cassandra
is straightforward (see `com.findinpath.repository.UserBookmarkRepository` for more details):

```java
  public ListenableFuture<UserBookmark> saveAsync(UserBookmark userBookmark) {
    return asyncCassandraOperations.insert(userBookmark);
  }
```

A little trick needs therefor to be employed in the `AspectJ` `RepositoryTimerAspect`class
for timing such non-blocking methods. After retrieving the result from the target method
invocation, a callback is being registered for emiting the metrics in both success and
failure cases after the completion of the method:

```java
    var asyncResult = (ListenableFuture) proceedingJoinPoint.proceed();
    asyncResult.addCallback(
        result -> emitMetrics(meterRegistry, sample, className, methodName, Optional.empty()),
        ex -> emitMetrics(meterRegistry, sample, className, methodName, Optional.of(ex)));
    return asyncResult;
```

## Spring AOP

In case that it is needed for reference a Spring AOP implementation 
for timing the spring data repositories, 
the project source code provides also such an implementation, although commented,
in order to avoid causing issues with the `AspectJ` `RepositoryTimerAspect.

See `com.findinpath.config.RepositoryTimerConfiguration` for details.

## Demo

The project [spring-data-cassandra-repository-methods-timing](https://github.com/findinpath/spring-data-cassandra-repository-methods-timing) 
comes with a `com.findinpath.DemoTest` class which contains test scenarios
for timing both kinds of spring data repositories:

- the class is annotated with the `@org.springframework.stereotype.Repository` annotation
- the class implements `org.springframework.data.repository.Repository` class

and also both synchronous and asynchronous methods.

Below are the measurements logged from one of the runs of the `DemoTest`:

```bash
The timer MeterId{name='repository', tags=[tag(class=ConfigRepository),tag(method=save),tag(successful=true)]} has max value: 176 ms and mean value: 25 ms
The timer MeterId{name='repository', tags=[tag(class=ConfigRepository),tag(method=findById),tag(successful=true)]} has max value: 22 ms and mean value: 8 ms
```

```bash
The timer MeterId{name='repository', tags=[tag(class=UserBookmarkRepository),tag(method=save),tag(successful=true)]} has max value: 32 ms and mean value: 9 ms
The timer MeterId{name='repository', tags=[tag(class=UserBookmarkRepository),tag(method=saveAsync),tag(successful=true)]} has max value: 33 ms and mean value: 8 ms
The timer MeterId{name='repository', tags=[tag(class=UserBookmarkRepository),tag(method=findLatestBookmarks),tag(successful=true)]} has max value: 12 ms and mean value: 7 ms
The timer MeterId{name='repository', tags=[tag(class=UserBookmarkRepository),tag(method=findLatestBookmarksAsync),tag(successful=true)]} has max value: 25 ms and mean value: 12 ms

``` 


The test is being executed against a throwaway Cassandra database container (through the 
help of the genius team formed from [docker](https://www.docker.com/) and the
 [testcontainers](https://www.testcontainers.org/) library).
 
In order to keep the demo project simple to go through, no setup has been 
made for a web application that would expose operations to interact with Cassandra
database. This is why in order to test the concepts showcased by the project, 
only the  `com.findinpath.DemoTest` class is provided.

Simply use `mvn clean install` for trying out the project.
