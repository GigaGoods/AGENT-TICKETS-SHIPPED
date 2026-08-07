import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExtractedDocument } from '../verification/validator.js';

const diceTicket = {
  eventName:
    '(A-Z) Elliot Schooling & Liam Palmer, L.P. Rhythm, Miguelle & Tons + Ranger Trucco',
  eventDate: '09/12/2026',
  venue: 'Club Space Miami',
  platform: 'Dice',
  orderId: null,
  confirmationNumber: null,
  ticketCount: 1,
  seatInfo: 'GA',
  pricePaid: null,
  currency: null,
  barcodeOrQrPresent: 'unknown',
};

test('accepts a listed artist contained within a full lineup title', () => {
  const result = validateExtractedDocument(
    diceTicket,
    {
      eventName: 'Ranger Trucco',
      eventDate: '2026-09-12',
      venue: 'Club Space Miami',
      ticketCount: 1,
    },
    'mobile_ticket',
    0.94,
    []
  );

  assert.equal(result.ticketDetected, true);
  assert.equal(result.status, 'verified');
  assert.equal(
    result.fieldMatches.find((field) => field.field === 'eventName')?.matched,
    true
  );
});

test('infers the listing year when a ticket only shows month and day', () => {
  const result = validateExtractedDocument(
    {
      ...diceTicket,
      eventName:
        '(A-Z) Elliot Schooling & Liam Palmer, L.P. Rhythm, Miguelle & Tons + Ranger Trucco',
      eventDate: 'Aug 8',
    },
    {
      eventName: 'Ranger Trucco',
      eventDate: '2026-08-08',
      venue: 'Club Space Miami',
      ticketCount: 1,
    },
    'mobile_ticket',
    0.94,
    []
  );

  assert.equal(result.status, 'verified');
  assert.equal(
    result.fieldMatches.find((field) => field.field === 'eventDate')?.matched,
    true
  );
});

test('rejects an image that is not recognized as a ticket', () => {
  const result = validateExtractedDocument(
    {
      ...diceTicket,
      eventName: null,
      eventDate: null,
      venue: null,
      platform: null,
      ticketCount: null,
    },
    {
      eventName: 'Ranger Trucco',
      eventDate: '2026-09-12',
      venue: 'Club Space Miami',
    },
    'unknown',
    0.2,
    []
  );

  assert.equal(result.ticketDetected, false);
  assert.equal(result.status, 'rejected');
});

test('reports image-quality and authenticity concerns without blocking the listing', () => {
  const listing = {
    eventName: 'Ranger Trucco',
    eventDate: '2026-09-12',
    venue: 'Club Space Miami',
    ticketCount: 1,
  };

  const blurry = validateExtractedDocument(
    diceTicket,
    listing,
    'mobile_ticket',
    0.9,
    ['blurry_image']
  );
  const suspicious = validateExtractedDocument(
    diceTicket,
    listing,
    'mobile_ticket',
    0.9,
    ['suspicious_editing']
  );

  // Loose-ticket policy: soft signals are surfaced but never block — a real
  // ticket photographed badly still verifies.
  assert.equal(blurry.status, 'verified');
  assert.equal(suspicious.status, 'verified');
  assert.match(blurry.reviewReasons[0], /blurry_image/);
  assert.match(suspicious.reviewReasons[0], /suspicious_editing/);
});
