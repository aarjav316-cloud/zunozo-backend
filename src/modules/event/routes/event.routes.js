import express from 'express'

import { createEvent } from '../controllers/event.controller.js'
import { protect  } from '../../../middleware/middleware.js'
import validate from '../../../middleware/validate.middleware.js'
import { createEventSchema } from '../validation/event.validation.js'
import { authorizeRoles } from '../../../middleware/rbac.middleware.js'


const router = express.Router();

router.post(
    "/",
    protect,
    authorizeRoles("ORGANIZER"),
    validate(createEventSchema),
    createEvent
)

export default router;




