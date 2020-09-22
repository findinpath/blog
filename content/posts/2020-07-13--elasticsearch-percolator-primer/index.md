---
title: Elasticsearch percolator primer
tags: ["elasticsearch","percolator"]
cover: piotr-miazga-zYGtxp8H5sY-unsplash.png
author: findinpath
---


Primer in understanding the reverse search concepts behind the Elasticsearch percolator.

In a classical search scenario, a term query is used as input and the documents
from the search index matching the term will be returned as output.
On the other hand, when percolating, a document will be used as input and the
search queries registered in the search index which match the document will
be returned as output.


Technically, the basic idea behind the percolator is that (as denoted by the documentation of the percolate query):

> It can be used to match queries stored in an index.
> The percolate query itself contains the document that will be used as query to match with the stored queries.


The percolate query is called turning search upside down in the
[Elasticsearch in action](https://livebook.manning.com/book/elasticsearch-in-action/appendix-e/) book
for the following reasons:

> - You index queries instead of documents. This registers the query in memory, so it can be quickly run later.
> - You send a document to Elasticsearch instead of a query. This is called percolating a document, basically indexing it into a small, in-memory index. Registered queries are run against the small index, so Elasticsearch finds out which queries match.
> - You get back a list of queries matching the document, instead of the other way around like a regular search.


The implementation of the percolator can be found in the [percolator](https://github.com/elastic/elasticsearch/tree/master/modules/percolator)
module from the [elasticsearch](https://github.com/elastic/elasticsearch/) Github repository.


## How does the percolator actually work

Initially, when the percolator  was released back in the version `0.15.0.` of Elasticsearch,
the execution time of the percolator was always linear to the amount of percolator queries, because
all percolator queries had to be evaluated all the time.


When percolating, the document being percolated gets indexed into temporary in-memory index.
Prior to version `5.0` of Elsticsearch, all percolator queries needed to be executed on an
in-memory index in order to verify whether the query matches.

As of version `5.0` of Elasticsearch there have been added dramatic improvements on how the percolator
works by being able to skip evaluating most queries against the in-memory index.


The percolator analyses the queries and creates appropriate data structures in order to
be able to filter only the relevant search queries that need to be executed on the memory
index containing the percolated document:

- for a  _term_ (e.g. : search for all the documents containing `elastic` ) query there will be
used a `org.apache.lucene.search.TermScorer` that will make use of the [Lucene](https://lucene.apache.org/)
inverted index functionality for retrieving only the documents that contain the searched term

- for a int field (e.g. : search all the real estate object with `4` rooms) an intersection will be made
between the range of the percolated document (e.g. : `4` to `4`) and the [KD tree](https://www.youtube.com/watch?v=Z4dNLvno-EY)
containing the ranges (e.g. : `0` TO `3` , `4` TO `*`, `2` TO `5`, etc.)

**NOTE**: Some query types can't be filtered (e.g. : wildcard queries) reason why they will be need
to be executed against the memory index to check whether they match the percolated document.

The [percolator](https://github.com/elastic/elasticsearch/tree/master/modules/percolator) classes relevant
for understanding how the queries get analysed and converted into documents belonging to a query search index are:

- [QueryAnalyzer.java](https://github.com/elastic/elasticsearch/blob/master/modules/percolator/src/main/java/org/elasticsearch/percolator/QueryAnalyzer.java)
- [PercolatorFieldMapper.java](https://github.com/elastic/elasticsearch/blob/master/modules/percolator/src/main/java/org/elasticsearch/percolator/PercolatorFieldMapper.java)


Try out the [tests](https://github.com/findinpath/elastic-percolator-primer/blob/master/src/test/java/org/elasticsearch/percolator/CandidateQueryTests.java)
from the [elastic-percolator-primer](https://github.com/findinpath/elastic-percolator-primer/) Java project
in _Debug mode_ with breakpoints in the previously mentioned percolator classes to get a hands-on understanding
how the query search indexes used in the percolation process are built and used.

## Usage demo

This demo is based on the blog post

https://sharing.luminis.eu/blog/using-the-new-elasticsearch-5-percolator/

and contains just simple modifications in order to get the queries compatible with Elasticsearch `7.x`.

Use either the [standalone](https://www.elastic.co/downloads/elasticsearch) installation or the
[docker](https://hub.docker.com/_/elasticsearch) image for Elasticsearch to get started.



### Create `news` index
```bash
# Create news index and populate it with documents

curl -X PUT "http://localhost:9200/news?pretty" -H 'Content-Type: application/json' -d'
{
  "mappings": {
    "properties": {
      "title": {"type": "text"},
      "body": {"type": "text"},
      "category": {"type": "keyword"}
    }
  }
}'
```

### Populate `news` index with documents

```bash
curl -X PUT "http://localhost:9200/news/_doc/1" -H 'Content-Type: application/json' -d'
{
  "title": "Early snow this year",
  "body": "After a year with hardly any snow, this is going to be a serious winter",
  "category": "weather"
}'


curl -X PUT "http://localhost:9200/news/_doc/2" -H 'Content-Type: application/json' -d'
{
  "title": "Snow on the ground, sun in the sky",
  "body": "I am waiting for the day where kids can skate on the water and the dog can play in the snow while we are sitting in the sun.",
  "category": "weather"
}'


curl -X PUT "http://localhost:9200/news/_doc/3" -H 'Content-Type: application/json' -d'
{
  "title": "Snow everywhere",
  "body": "Everything is covered in snow. The sun is shining.",
  "category": "weather"
}'

```

### Basic search operations on the `news` index

```bash
# Get one document by id

curl -X GET "localhost:9200/news/_doc/1?pretty"

```

```bash
# Retrieve all documents

curl -X GET "localhost:9200/news/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": { "match_all": {} }
}
'

```

### Create the `news-notify` index

As recommended in the documentation of
[search_after](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-body.html#request-body-search-search-after)
there will be used a special field `tie_breaker_id` for the search queries to be employed in ordering the paged
percolation results.

```bash
curl -X PUT "localhost:9200/news-notify?pretty" -H 'Content-Type: application/json' -d'
{
    "mappings": {
        "properties": {
             "title": {
                 "type": "text"
             },
             "category": {
                 "type": "keyword"
             },
             "tie_breaker_id": {
                "type": "long"
             },
             "query": {
                 "type": "percolator"
             }
        }
    }
}
'

```

### Populate `news-notify` index

```bash

curl -XPUT "http://localhost:9200/news-notify/_doc/1" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "snow"
          }
        }
      ],
      "filter": [
        {
          "term": {"category":  "weather"}
        }
      ]
    }
  },
  "tie_breaker_id": 1,
  "meta": {
    "username": "sander",
    "create_date": "2016-10-13T14:23:00"
  }
}'

curl -XPUT "http://localhost:9200/news-notify/_doc/2" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "sun"
          }
        }
      ],
      "filter": [
        {
          "term": {
            "category": {
              "value": "weather"
            }
          }
        }
      ]
    }
  },
  "tie_breaker_id": 2,
  "meta": {
    "username": "jettro",
    "create_date": "2016-10-13T14:21:45"
  }
}'

curl -XPUT "http://localhost:9200/news-notify/_doc/3" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "sun"
          }
        }
      ],
      "filter": [
        {
          "term": {
            "category": {
              "value": "weather"
            }
          }
        }
      ]
    }
  },
  "tie_breaker_id": 3,
  "meta": {
    "username": "lara",
    "create_date": "2016-10-13T14:21:45"
  }
}'

curl -XPUT "http://localhost:9200/news-notify/_doc/4" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "snow"
          }
        }
      ],
      "filter": [
        {
          "term": {
            "category": {
              "value": "weather"
            }
          }
        }
      ]
    }
  },
  "tie_breaker_id": 4,
  "meta": {
    "username": "simon",
    "create_date": "2016-10-13T14:21:45"
  }
}'
```

### Percolate queries

Specify the document to be percolated within the query:

```bash
curl -XGET "http://localhost:9200/news-notify/_search" -H 'Content-Type: application/json' -d'{
   "query":{
      "percolate":{
         "field":"query",
         "document":{
           "title" : "Early snow this year",
           "body" : "After a year with hardly any snow, this is going to be a serious winter",
           "category" : "weather"
         }
      }
   }
}'
```

or reference it from the `news` index (if it has already been indexed):

```bash
curl -XGET "http://localhost:9200/news-notify/_search" -H 'Content-Type: application/json' -d'{
   "query":{
      "percolate":{
         "field":"query",
         "index":"news",
         "id":"1"
      }
   }
}'

```

### Paging of the percolation results with `search_after`

Pagination of results can be done by using the from and size,
but the cost becomes prohibitive when the deep pagination is reached.
Take a look at the [search_after](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-body.html#request-body-search-search-after)
documentation to see how this problem can be circumvented.


```bash

curl -XGET "http://localhost:9200/news-notify/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "percolate": {
      "field": "query",
      "index": "news",
      "id": "2"
    }
  },
  "sort": [
        {"tie_breaker_id": "asc"}
  ],
  "size": 1
}'


# search_after will be populated in the with the ID of the last
# document retrieved in the last query (e.g. : `1`)


curl -XGET "http://localhost:9200/news-notify/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "percolate": {
      "field": "query",
      "index": "news",
      "id": "2"
    }
  },
  "sort": [
        {"tie_breaker_id": "asc"}
  ],
  "search_after":[1],
  "size": 1
}'

```

### Delete indexes
```bash

curl -X DELETE "localhost:9200/news?pretty"

curl -X DELETE "localhost:9200/news-notify?pretty"
```

## Resources

Announcement of the release of the Elasticsearch percolator

- https://www.elastic.co/blog/percolator

When and how to percolate

- https://www.elastic.co/blog/when-and-how-to-percolate-1

- https://www.elastic.co/blog/when-and-how-to-percolate-2

Introduction of the percolate query

- https://www.elastic.co/blog/elasticsearch-percolator-continues-to-evolve


## Code

Try out the tests from the Github project [elastic-percolator-primer](https://github.com/findinpath/elastic-percolator-primer/)
to get a feeling about how the percolator works.
