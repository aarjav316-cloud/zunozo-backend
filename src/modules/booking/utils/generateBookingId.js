const generateBookingId = (sequenceNumber) => {
    const today = new Date();

     const date =
         today.getFullYear().toString() +
         String(today.getMonth() + 1).padStart(2, "0") +
         String(today.getDate()).padStart(2, "0");

     const sequence = String(sequenceNumber).padStart(6, "0");
   
     return `ZNZ-${date}-${sequence}`;
}


