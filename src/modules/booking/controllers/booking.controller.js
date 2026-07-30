import mongoose from "mongoose";

import Booking from "../model/booking.model.js";
import Event from "../../event/models/event.model.js";
import Counter from "../model/counter.model.js";

import generateBookingId from "../utils/generateBookingId.js";
import generateTicketCode from "../utils/generateTicketCode.js";


import { invalidateBookingCache } from "../cache/booking.cache.js";
import { invalidateEventCache } from "../../event/cache/event.cache.js";


export const createBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId = req.user._id;

    const {
      eventId,
      quantity,
    } = req.body;

    /**
     * ---------------------------------------------------
     * Fetch Event
     * ---------------------------------------------------
     */

    const event = await Event.findById(eventId).session(session);

    if (!event) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Status Validation
     * ---------------------------------------------------
     */

    if (event.isDeleted) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "This event is no longer available.",
      });
    }

    if (event.status !== "APPROVED") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Bookings are not available for this event.",
      });
    }

    /**
     * ---------------------------------------------------
     * Booking Deadline Validation
     * ---------------------------------------------------
     */

    const now = new Date();

    if (event.bookingDeadline && now > event.bookingDeadline) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Booking deadline has passed.",
      });
    }

    /**
     * ---------------------------------------------------
     * Event Already Started
     * ---------------------------------------------------
     */

    if (now >= event.startDate) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Bookings are closed. Event has already started.",
      });
    }

    /**
     * ---------------------------------------------------
     * Ticket Quantity Validation
     * ---------------------------------------------------
     */

    if (quantity > event.maxTicketsPerBooking) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: `Maximum ${event.maxTicketsPerBooking} tickets can be booked at once.`,
      });
    }

    /**
     * ---------------------------------------------------
     * Capacity Validation
     * ---------------------------------------------------
     */

    const availableTickets = event.capacity - event.ticketsSold;

    if (availableTickets <= 0) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "This event is sold out.",
      });
    }

    if (quantity > availableTickets) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: `Only ${availableTickets} ticket(s) left.`,
      });
    }

    /**
     * ---------------------------------------------------
     * Price Calculation
     * ---------------------------------------------------
     */

    const pricePerTicket = event.isFree ? 0 : event.price;

    const totalAmount = pricePerTicket * quantity;

    /**
     * =====================================================
     * PART-2 STARTS FROM HERE
     *
     * Next:
     * 1. Counter Increment
     * 2. Booking ID
     * 3. Ticket Code
     * 4. Booking Creation
     * 5. Update ticketsSold
     * =====================================================
     */

        /**
     * ---------------------------------------------------
     * Generate Booking Sequence
     * ---------------------------------------------------
     */

    const counter = await Counter.findByIdAndUpdate(
      "booking",
      {
        $inc: {
          sequenceValue: 1,
        },
      },
      {
        new: true,
        upsert: true,
        session,
      }
    );

    /**
     * ---------------------------------------------------
     * Generate Booking ID
     * ---------------------------------------------------
     */

    const bookingId = generateBookingId(counter.sequenceValue);

    /**
     * ---------------------------------------------------
     * Generate Ticket Code
     * ---------------------------------------------------
     */

    const ticketCode = generateTicketCode();

    /**
     * ---------------------------------------------------
     * Booking Status
     * ---------------------------------------------------
     */

    const bookingStatus = "CONFIRMED";

    const paymentStatus = event.isFree ? "SUCCESS" : "PENDING";

    /**
     * ---------------------------------------------------
     * Create Booking
     * ---------------------------------------------------
     */

    const [booking] = await Booking.create(
      [
        {
          bookingId,
          ticketCode,

          user: userId,
          organizer: event.organizer,
          event: event._id,

          quantity,

          pricePerTicket,
          totalAmount,

          bookingStatus,
          paymentStatus,
        },
      ],
      {
        session,
      }
    );

    /**
     * ---------------------------------------------------
     * Update Event Capacity
     * ---------------------------------------------------
     */

    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: event._id,
        ticketsSold: {
          $lte: event.capacity - quantity,
        },
      },
      {
        $inc: {
          ticketsSold: quantity,
        },
      },
      {
        new: true,
        session,
      }
    );

    /**
     * ---------------------------------------------------
     * Prevent Overselling
     * ---------------------------------------------------
     */

    if (!updatedEvent) {
      throw new Error("Tickets are no longer available.");
    }

    /**
     * =====================================================
     * PART-3 STARTS FROM HERE
     *
     * 1. Commit Transaction
     * 2. Cache Invalidation
     * 3. Response
     * =====================================================
     */

  } catch (error) {
    await session.abortTransaction();

    console.error("Create Booking Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error.",
    });
  }
};