const validate = (schema) => {
  return (req, res, next) => {
    let parsed;
    try {
      const isNested =
        schema.shape &&
        (schema.shape.body || schema.shape.query || schema.shape.params);

      if (isNested) {
        parsed = schema.parse({
          body: req.body,
          query: req.query,
          params: req.params,
        });
        
        if (parsed.body) {
          req.body = parsed.body;
        }
        if (parsed.query) {
          for (const key of Object.keys(req.query || {})) delete req.query[key];
          Object.assign(req.query, parsed.query);
        }
        if (parsed.params) {
          for (const key of Object.keys(req.params || {})) delete req.params[key];
          Object.assign(req.params, parsed.params);
        }
      } else {
        req.body = schema.parse(req.body);
      }
    } catch (error) {
      console.error("[VALIDATION FAILED]", error);
      const formattedErrors = {};

      if (error.issues) {
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

      return res.status(500).json({ 
        success: false, 
        message: "Internal Validation Error", 
        error: error.message 
      });
    }

    // Only call next() if validation succeeded
    next();
  };
};

export default validate;






