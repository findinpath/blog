---
title: Bind spring-boot configuration properties in Kotlin 
tags: ["spring-boot"]
cover: spring-boot-configuration.png
author: findinpath
---


This post showcases how to bind `@ConfigurationProperties` in [spring-boot](https://spring.io/projects/spring-boot)
projects written in [kotlin](https://kotlinlang.org/).

Spring Boot offers the [@ConfigurationProperties](https://docs.spring.io/spring-boot/docs/current/api/org/springframework/boot/context/properties/ConfigurationProperties.html) annotation in order to allow binding and validating properties set externally (e.g. via `application.yml` file).

When writing a [Spring Boot](https://spring.io/projects/spring-boot) application in Kotlin programming language, the usage of 
[data classes](https://kotlinlang.org/docs/reference/data-classes.html)
comes like a good candidate to be used for binding external properties that are to be used subseqently in the business logic code of the
spring beans.

Nevertheless, using an approach like the following


```kotlin
data class Project(val name: String, val code: String)
```

will result at the start of the spring boot application in the following binding error:

```bash
The elements [project.code,project.name] were left unbound.
```

This happens because the binding is done by property setters (which can't succeed when using `val` fields in kotlin).


There are several solutions to solve the binding of the external properties in kotlin classes.

The outcome of solutions is that the fields of the `Project` class will be kotlin friendly non-null fields
and that the bootstrap of the spring application will fail in case that the required properties are not specified. 



## ConstructorBinding

By using the [@ConstructorBinding](https://docs.spring.io/spring-boot/docs/current/api/org/springframework/boot/context/properties/ConstructorBinding.html)
annotation in the data class we can indicate that configuration properties should be bound using constructor arguments rather than by calling setters. 

```kotlin
import org.springframework.boot.context.properties.ConstructorBinding

@ConstructorBinding
data class Project(val name: String, val code: String)
```


## Lateinit properties

Use `lateinit` modifier for allowing the properties of the class to be set at a later time.

```kotlin
class Project{
    lateinit var name: String
    lateinit var code: String


    override fun toString(): String {
        return "Project(name='$name', code='$code')"
    }
}
```