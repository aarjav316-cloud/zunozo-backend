const validate = (schema) => {
  return (req, res, next) => {
    try {
      const isNested =
        schema.shape &&
        (schema.shape.body || schema.shape.query || schema.shape.params);

      if (isNested) {
        const parsed = schema.parse({
          body: req.body,
          query: req.query,
          params: req.params,
        });
        if (parsed.body) req.body = parsed.body;
        if (parsed.query) req.query = parsed.query;
        if (parsed.params) req.params = parsed.params;
      } else {
        req.body = schema.parse(req.body);
      }

      next();
    } catch (error) {
      const formattedErrors = {};

      for (const issue of error.issues) {
        // Use the last key in the path for the error message, ensuring nested schemas don't group under 'body'
        const fieldName = issue.path[issue.path.length - 1];
        formattedErrors[fieldName] = issue.message;
      }

      return res.status(400).json({
        success: false,
        message: "Validation Failed",
        errors: formattedErrors,
      });
    }
  };
};

export default validate;






