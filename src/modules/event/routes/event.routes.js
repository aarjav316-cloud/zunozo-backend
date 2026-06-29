import express from 'express'

import { createEvent, getEventById, getMyEvents, updateEvent } from '../controllers/event.controller.js'
import { protect  } from '../../../middleware/middleware.js'
import validate from '../../../middleware/validate.middleware.js'
import { createEventSchema } from '../validation/event.validation.js'
import { authorizeRoles } from '../../../middleware/rbac.middleware.js'
import { updateEventSchema } from '../validation/updateEventSchema.js'


const router = express.Router();

router.post(
    "/",
    protect,
    authorizeRoles("ORGANIZER"),
    validate(createEventSchema),
    createEvent
)

router.get(
    "/my-events",
    protect,
    authorizeRoles("ORGANIZER"),
    getMyEvents
)

router.get(
    "/my-events/:eventId",
    protect,
    authorizeRoles("ORGANIZER"),
    getEventById
)

router.patch(
    "/:eventId",
    protect,
    authorizeRoles("ORGANIZER"),
    validate(updateEventSchema),
    updateEvent
)

router.delete(
  "/:eventId",
  protect,
  authorizeRoles("ORGANIZER"),
  deleteEvent
);

export default router;




