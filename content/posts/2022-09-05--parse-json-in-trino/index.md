---
title: Parse JSON in Trino
tags: ["trino", "json"]
cover: stefan-rodriguez-bzSgdupS95U-unsplash.jpg
author: findinpath
---

This post showcases a more complex scenario which makes use of the `JSON` functions
made available in [Trino](https://trino.io/).

Say you are tasked with retrieving the number of companies by creator from records
which have the following structure

```json
{
   "createdBy":2,
   "teams":[
      {
         "companyId":10,
         "teamId":1
      }
   ]
}
```

Let's setup on the fly a simple scenario via Trino:

```bash
docker run --rm -d --name trino -p 8080:8080 trinodb/trino
```

For the purpose of this exercise, we can use the [Memory connector](https://trino.io/docs/current/connector/memory.html):

```sql
trino> use memory.default;
USE
trino:default> CREATE TABLE test1 (v varchar);
CREATE TABLE
trino:default> INSERT INTO test1
VALUES
    '{"createdBy":2,"teams":[{"companyId":10,"teamId":101},{"companyId":10,"teamId":102}]}',
    '{"createdBy":2,"teams":[{"companyId":20,"teamId":203},{"companyId":30,"teamId":204}]}',
    '{"createdBy":3,"teams":[{"companyId":10,"teamId":103},{"companyId":40,"teamId":104}]}';
```

Now that we have the premises to test our scenario, we can proceed to resolve the problem at hand.

When dealing with `JSON` data, [JSON functions and operators](https://trino.io/docs/current/functions/json.html)
from Trino can come in handy:

```sql
SELECT
   json_query(v, 'strict $.createdBy') AS created_by,
   json_query(v, 'strict $.teams[*].companyId' WITH ARRAY WRAPPER) AS companies
FROM test1;
```

```generic
 created_by | companies
------------+-----------
 2          | [10,10]
 2          | [20,30]
 3          | [10,40]
(3 rows)
```

The output for the `companies` column is of type `VARCHAR`.
We need to parse this content to an `ARRAY` in order to expand it via [UNNEST](https://trino.io/docs/current/sql/select.html#unnest).

```sql
SELECT created_by,
       company
FROM (
    SELECT created_by,
           cast(json_parse(companies) as array(integer)) as companies
    FROM (
         SELECT
             json_query(v, 'strict $.createdBy') AS created_by,
             json_query(v, 'strict $.teams[*].companyId' WITH ARRAY WRAPPER) AS companies
         FROM test1
    )
)
CROSS JOIN UNNEST(companies) AS t(company);
```

```generic
created_by | company
------------+---------
 2          |      10
 2          |      10
 2          |      20
 2          |      30
 3          |      10
 3          |      40
```

Now the counting problem becomes a simple grouping problem:

```sql
WITH input AS (SELECT
                 json_query(v, 'strict $.createdBy')                             AS created_by,
                 json_query(v, 'strict $.teams[*].companyId' WITH ARRAY WRAPPER) AS companies
               FROM test1),
     companies_by_creator AS (SELECT
                                created_by,
                                cast(json_parse(companies) as array(integer)) as companies
                              FROM input),
     creator_to_company AS (SELECT
                              created_by,
                              company
                            FROM companies_by_creator
                                   CROSS JOIN UNNEST(companies) AS t(company)),
     creator_to_company_count AS (SELECT
                                    created_by,
                                    COUNT(DISTINCT company) as companies
                                  FROM creator_to_company
                                  GROUP BY created_by)

SELECT *
FROM creator_to_company_count
ORDER BY created_by;
```

```generic
 created_by | companies
------------+-----------
 2          |         3
 3          |         2
```


The query has been rewritten with common table expressions for improving its readability.


Now that the demo is complete, the test environment can be stopped via:

```bash
docker stop trino
```
