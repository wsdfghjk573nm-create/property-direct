'use strict';

/**
 * Property Direct — email-backed "Post Your Requirement" form for buyers
 * and tenants.
 *
 * The live GitHub Pages site has no server or database. This form sends a
 * requirement to the same FormSubmit AJAX endpoint as the Sell form, which
 * delivers it to the site owner's email inbox. Property Direct then contacts
 * the buyer/tenant manually if an owner submits a matching property.
 * Nothing is published automatically on the page.
 *
 * Configured for the owner's confirmed receiving Gmail address.
 */
const BUYER_FORM_ENDPOINT = 'https://formsubmit.co/ajax/wsdfghjk573nm@gmail.com';

function setBuyerStatus(statusEl, message, kind) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('success', 'error');
  if (kind) statusEl.classList.add(kind);
}

function validateBuyerForm(form) {
  if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
    if (typeof form.reportValidity === 'function') form.reportValidity();
    return 'Please fill in every field marked * and tick the confirmation.';
  }
  return '';
}

async function handleBuyerSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget || event.target;
  const statusEl = document.getElementById('buyerFormStatus');
  const submitBtn = document.getElementById('buyerSubmitBtn');

  const validationError = validateBuyerForm(form);
  if (validationError) {
    setBuyerStatus(statusEl, validationError, 'error');
    return false;
  }

  if (!BUYER_FORM_ENDPOINT) {
    setBuyerStatus(statusEl, 'This form is not ready to receive submissions yet. Please try again later.', 'error');
    return false;
  }

  const payload = new FormData(form);
  payload.append('_subject', 'New Property Direct buyer requirement');
  payload.append('_template', 'table');

  const emailField = form && form.elements ? form.elements.namedItem('email') : null;
  if (emailField && emailField.value) payload.append('_replyto', emailField.value);

  if (submitBtn) submitBtn.disabled = true;
  setBuyerStatus(statusEl, 'Sending your requirement…', '');

  try {
    const response = await fetch(BUYER_FORM_ENDPOINT, {
      method: 'POST',
      body: payload,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Submission failed');

    form.reset();
    setBuyerStatus(statusEl, 'Thank you — your requirement has been submitted. Property Direct will contact you if an owner posts a matching property.', 'success');
    return true;
  } catch (error) {
    setBuyerStatus(statusEl, 'Sorry — the submission could not be sent. Please check your connection and try again.', 'error');
    return false;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function initBuyerForm() {
  const form = document.getElementById('buyerForm');
  if (form) form.addEventListener('submit', handleBuyerSubmit);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initBuyerForm);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BUYER_FORM_ENDPOINT,
    validateBuyerForm,
    handleBuyerSubmit,
  };
}
