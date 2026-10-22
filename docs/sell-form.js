'use strict';

/**
 * Property Direct — email-backed Sell / Post Your Property form.
 *
 * The live GitHub Pages site has no server or database. This form sends a
 * submission to the configured FormSubmit AJAX endpoint, which delivers it
 * to the site owner's chosen email inbox for manual review. A submission is
 * never published automatically on the page.
 *
 * Configured for the owner's confirmed receiving Gmail address.
 */
const SELL_FORM_ENDPOINT = 'https://formsubmit.co/ajax/wsdfghjk573nm@gmail.com';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function setSellStatus(statusEl, message, kind) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('success', 'error');
  if (kind) statusEl.classList.add(kind);
}

function getNamedField(form, name) {
  if (!form || !form.elements) return null;
  if (typeof form.elements.namedItem === 'function') return form.elements.namedItem(name);
  return form.elements[name] || null;
}

function validateSellForm(form) {
  if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
    if (typeof form.reportValidity === 'function') form.reportValidity();
    return 'Please fill in every field marked * and tick the owner confirmation.';
  }

  const photo = getNamedField(form, 'attachment');
  const file = photo && photo.files && photo.files[0];
  if (file && file.size > MAX_PHOTO_BYTES) {
    return 'The photo is larger than 10 MB. Please choose a smaller photo.';
  }
  return '';
}

async function handleSellSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget || event.target;
  const statusEl = document.getElementById('sellFormStatus');
  const submitBtn = document.getElementById('sellSubmitBtn');

  const validationError = validateSellForm(form);
  if (validationError) {
    setSellStatus(statusEl, validationError, 'error');
    return false;
  }

  if (!SELL_FORM_ENDPOINT) {
    setSellStatus(statusEl, 'This form is not ready to receive submissions yet. Please try again later.', 'error');
    return false;
  }

  const payload = new FormData(form);
  payload.append('_subject', 'New Property Direct property submission');
  payload.append('_template', 'table');

  const emailField = getNamedField(form, 'email');
  if (emailField && emailField.value) payload.append('_replyto', emailField.value);

  if (submitBtn) submitBtn.disabled = true;
  setSellStatus(statusEl, 'Sending your property details…', '');

  try {
    const response = await fetch(SELL_FORM_ENDPOINT, {
      method: 'POST',
      body: payload,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Submission failed');

    form.reset();
    setSellStatus(statusEl, 'Thank you — your property details have been submitted. Property Direct will review them and contact you.', 'success');
    return true;
  } catch (error) {
    setSellStatus(statusEl, 'Sorry — the submission could not be sent. Please check your connection and try again.', 'error');
    return false;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function initSellForm() {
  const form = document.getElementById('sellForm');
  if (form) form.addEventListener('submit', handleSellSubmit);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initSellForm);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SELL_FORM_ENDPOINT,
    MAX_PHOTO_BYTES,
    validateSellForm,
    handleSellSubmit,
  };
}
