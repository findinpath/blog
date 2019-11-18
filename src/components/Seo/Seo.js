import React from "react";
import PropTypes from "prop-types";
import Helmet from "react-helmet";
import config from "../../../content/meta/config";

const Seo = props => {
  const { data } = props;
  const pageTitle = props.pageTitle;
  const uri = props.uri;

  const postTitle = ((data || {}).frontmatter || {}).title;
  const postDescription = ((data || {}).frontmatter || {}).description;
  const postCover = (((((data || {}).frontmatter || {}).cover || {}).childImageSharp || {}).resize || {}).src;

  const title = config.shortSiteTitle + " - " + (postTitle || pageTitle)
  const description = postDescription ? postDescription : config.siteDescription;
  const image = postCover ? config.siteUrl + postCover : config.siteUrl + "/" + config.siteImage;
  const url = uri ? config.siteUrl + uri : config.siteUrl;

  return (
    <Helmet
      htmlAttributes={{
        lang: config.siteLanguage,
        prefix: "og: http://ogp.me/ns#"
      }}
    >
      {/* General tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      {/* OpenGraph tags */}
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={config.siteTitle} />
    </Helmet>
  );
};

Seo.propTypes = {
  data: PropTypes.object
};

export default Seo;
