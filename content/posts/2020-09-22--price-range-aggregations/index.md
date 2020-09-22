---
title: Price range aggregations
tags: ["elasticsearch"]
cover: carolyn-v-lthWC8oevDg-unsplash.png
author: findinpath
---

Recipes for building dynamically balanced price range aggregations with
Elasticsearch.

A common functionality in each webshop is the ability to show price range
aggregations when searching for products.

When searching for a generic product (e.g. : backpack, shoes) the users
are nowadays accustomed to see in the search result page a panel containing
the distribution of the product prices matching their search.

e.g.: when searching for `backpack` on a marketplace website, there could
be displayed the following price range listing:

* up to 20 EUR - 10 items
* 20 to 40 EUR - 28 items
* 40 to 80 EUR - 52 items
* 80 to 180 EUR - 12 items
* from 180 EUR - 4 items


Elasticsearch supports performing [range aggregations](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-range-aggregation.html)
on a search request, but it requires the user to specify explicitly the ranges for the aggregation:

```bash
curl -X GET "localhost:9200/products/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": {
     "match": {
     	"category": "Luggage"
     }
  },
  "aggs": {
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 100.0 },
          { "from": 100.0, "to": 200.0 },
          { "from": 200.0 }
        ]
      }
    }
  }
}
'
```

The ranges in the price aggregation depend on the other hand pretty much on what
is being searched.
The price ranges that may be relevant to the users when searching for `shoes` will
very likely be different from the ones that will be shown when searching for `laptop`
because most of the shoes won't cost more than 150 EUR, where most of the decent laptops
start at 300-400 EUR.

There is currently quite an old open feature request to support
dynamically calculated price ranges:

https://github.com/elastic/elasticsearch/issues/9572

This blog post tries to provide a few possible answers on how to come
up with balanced ranges for the price aggregations on Elasticsearch searches.


## Static price ranges

As described above, Elasticsearch already offers the ability of specifying
ranges for the price in a search request.
The users like to choose from a list of up to 5 price ranges in order to
avoid being overwhelmed with options.

The main drawback when using this approach is that at the request time
there is no way to know how the prices of the products matching the search
will be distributed.

As a consequence, the price ranges used will sometimes not contain relevant
information.

## Use two queries to get balanced price range aggregations

Obtain first the distribution of prices for the search by using the
[percentiles aggregation](https://www.elastic.co/guide/en/elasticsearch/reference/7.9/search-aggregations-metrics-percentile-aggregation.html)
and subsequently use this information for specifying the price ranges of the price
aggregation in the second search request.


The few buckets that will be shown to the user for the price ranges will mirror
the actual price distribution for the products that are matching the search.

The principal drawback in this approach is that there are two search requests needed to
be made against Elasticsearch in order to obtain this information.
Having two requests may very likely be considered a drawback in adopting this strategy
for websites with a high amount of users performing searches.

For adding a bit of clarity here, a pseudocode version of the searches is exposed below, in the case
when there are up to 3 price ranges to be shown to the user:

```generic
Search 1: Get p33, p66 percentiles aggregation for the prices matching the search
Search 2: Use [0 - p33], [p33-p66], [p66 - *] as ranges in the price aggregation
```


## Collapse the buckets

This method builds on top of the static price ranges previously described.
Instead of retrieving a handful of buckets for the price range aggregation,
this method relies on specifying a lot of price range buckets (e.g. : 30/40/50)
which are then collapsed/merged on the client side to a handful (e.g. : 3/4/5) of relevant price range
buckets.

The main performance drawback in this approach is that there are much more price range buckets
specified to be aggregated in the search request compared to the number price range buckets that are
actually needed to be displayed to the user.



## Source Code

Check out the source code of the project [elastic-price-range-aggregation](https://github.com/findinpath/elastic-price-range-aggregation)
accompanying this blog post. This project contains code corresponding to each of the strategies
presented in this blog post.

This project contains a JUnit testcase that spawns a [testcontainers](https://www.testcontainers.org/)
[Elasticsearch container](https://www.testcontainers.org/modules/elasticsearch/) fills it with
test data and tries through different strategies to retrieve the price range aggregations.

Run the command

```bash
./gradlew test
```

for executing the tests from this project.

## Feedback

This blog post serves as a proof of concept for performing
price aggregations. Eventual improvements to the project code or ideas regarding
alternative ways to get the price aggregations are very much welcome.
