const validate = (schema) => {
  return (req, res, next) => {
    try {

      req.body = schema.parse(req.body);

      next();

    } catch (error) {

      const formattedErrors = {};

      for (const issue of error.issues) {
        formattedErrors[issue.path[0]] = issue.message;
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






