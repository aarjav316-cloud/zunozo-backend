import express from 'express'

import { createEvent, getApprovedEvents, getEventById, getMyEvents, getPendingEvents, reviewEvent, updateEvent } from '../controllers/event.controller.js'
import { protect  } from '../../../middleware/middleware.js'
import validate from '../../../middleware/validate.middleware.js'
import { createEventSchema } from '../validation/event.validation.js'
import { authorizeRoles } from '../../../middleware/rbac.middleware.js'
import { updateEventSchema } from '../validation/updateEventSchema.js'
import { reviewEventSchema } from '../validation/reviewEvent.validation.js'


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

router.get(
    "/admin/pending",
    protect,
    authorizeRoles("ADMIN"),
    getPendingEvents
)

router.patch(
    "/admin/:eventId/review",
    protect,
    authorizeRoles("ADMIN"),
    validate(reviewEventSchema),
    reviewEvent
)

router.get("/", getApprovedEvents)

export default router;




