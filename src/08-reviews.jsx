import React from 'react';
const { useState, useEffect, useRef } = React;
const createElement = React.createElement;
import { t } from './01-core.jsx';
import { AUTH, LEADERBOARD_API } from './features.js';

/* =================================================================
   JLPT Master — Reviews & Ratings tab
   Part of the app, split from the original app.js for readability.
   Uses React 18 via CDN (React.createElement, no JSX/build step).
   All components share the global scope and load in order (see index.html).

   Reviews are stored in the Firebase Realtime Database under
   `app_reviews` (public read, append-only for signed-in users — same
   model as `community_dictionary`). Reads use the public REST endpoint
   so the list works even before the user signs in; writes go through
   the Firebase SDK so the auth token is attached automatically.
   ================================================================= */

var REVIEWS_API = (function () {
    var DB_URL = 'https://jlpt-master-4cbf2-default-rtdb.firebaseio.com/app_reviews.json';

    // Public REST read — returns reviews newest-first.
    function fetchReviews() {
        return fetch(DB_URL)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data) return [];
                var list = [];
                for (var key in data) {
                    if (Object.prototype.hasOwnProperty.call(data, key)) {
                        var r = data[key];
                        list.push({
                            id: key,
                            uid: r.uid || '',
                            name: r.name || 'Anonymous',
                            avatar: r.avatar || '👤',
                            rating: r.rating || 0,
                            text: r.text || '',
                            createdAt: r.createdAt || 0
                        });
                    }
                }
                return list.sort(function (a, b) { return b.createdAt - a.createdAt; });
            });
    }

    // Authenticated append via the SDK (write rule requires auth != null).
    function submitReview(review) {
        if (typeof firebase === 'undefined' || !firebase.database) {
            return Promise.reject(new Error('Firebase not available'));
        }
        return firebase.database().ref('app_reviews').push(review);
    }

    return { fetchReviews: fetchReviews, submitReview: submitReview };
})();

/* -----------------------------------------------------------------
   StarRating — renders 1–5 stars. Interactive when onRate is given,
   otherwise read-only (with optional half-star fill via `value`).
   ----------------------------------------------------------------- */
function StarRating(props) {
    var value = props.value || 0;
    var _hover = useState(0);
    var hover = _hover[0], setHover = _hover[1];
    var interactive = typeof props.onRate === 'function';
    var size = props.size || '1.4rem';

    var stars = [1, 2, 3, 4, 5].map(function (n) {
        var active = (hover || value) >= n;
        return createElement('button', {
            key: n,
            type: 'button',
            className: 'review-star' + (active ? ' review-star--active' : '') + (interactive ? '' : ' review-star--readonly'),
            style: { fontSize: size },
            disabled: !interactive,
            onMouseEnter: interactive ? function () { setHover(n); } : null,
            onMouseLeave: interactive ? function () { setHover(0); } : null,
            onClick: interactive ? function () { props.onRate(n); } : null,
            'aria-label': n + ' star' + (n > 1 ? 's' : '')
        }, active ? '★' : '☆');
    });

    return createElement('div', { className: 'review-stars' }, stars);
}

/* -----------------------------------------------------------------
   ReviewsTab — leave and read app reviews.
   ----------------------------------------------------------------- */
function ReviewsTab(props) {
    var appLang = props.appLang;

    var _state = useState({ reviews: [], loading: true, error: null });
    var state = _state[0], setState = _state[1];

    var _user = useState(function () {
        return (typeof AUTH !== 'undefined' && AUTH.authObj) ? AUTH.authObj.currentUser : null;
    });
    var user = _user[0], setUser = _user[1];

    var _rating = useState(0);
    var rating = _rating[0], setRating = _rating[1];

    var _text = useState('');
    var text = _text[0], setText = _text[1];

    var _submitting = useState(false);
    var submitting = _submitting[0], setSubmitting = _submitting[1];

    var _notice = useState(null);
    var notice = _notice[0], setNotice = _notice[1];

    function loadReviews() {
        setState(function (s) { return { reviews: s.reviews, loading: true, error: null }; });
        REVIEWS_API.fetchReviews().then(function (reviews) {
            setState({ reviews: reviews, loading: false, error: null });
        }).catch(function (err) {
            setState({ reviews: [], loading: false, error: err.message || String(err) });
        });
    }

    useEffect(function () {
        loadReviews();
        if (typeof AUTH !== 'undefined') {
            AUTH.onAuthStateChanged(function (u) { setUser(u); });
        }
    }, []);

    function handleGoogleLogin() {
        if (typeof AUTH !== 'undefined') {
            AUTH.signIn().catch(function (e) { setNotice({ type: 'error', msg: 'Login failed: ' + e.message }); });
        }
    }

    function handleGuestLogin() {
        if (typeof AUTH !== 'undefined') {
            AUTH.signInAsGuest().catch(function (e) { setNotice({ type: 'error', msg: 'Guest login failed: ' + e.message }); });
        }
    }

    function submit() {
        if (!rating) { setNotice({ type: 'error', msg: 'Please choose a star rating first.' }); return; }
        if (!user) { setNotice({ type: 'error', msg: 'Please sign in to leave a review.' }); return; }

        var profile = (typeof LEADERBOARD_API !== 'undefined') ? LEADERBOARD_API.getProfile() : {};
        var review = {
            uid: user.uid,
            name: (user.displayName || profile.name || 'Anonymous').slice(0, 40),
            avatar: (user.photoURL || profile.avatar || '👤').slice(0, 200),
            rating: rating,
            text: text.trim().slice(0, 1000),
            createdAt: Date.now()
        };

        setSubmitting(true);
        setNotice(null);
        REVIEWS_API.submitReview(review).then(function () {
            setSubmitting(false);
            setRating(0);
            setText('');
            setNotice({ type: 'success', msg: 'Thanks for your review!' });
            loadReviews();
        }).catch(function (err) {
            setSubmitting(false);
            setNotice({ type: 'error', msg: 'Could not submit review: ' + (err.message || err) });
        });
    }

    function renderAvatar(avatar) {
        if (avatar && avatar.indexOf('http') === 0) {
            return createElement('img', { src: avatar, alt: '', className: 'review-avatar__img' });
        }
        return avatar || '👤';
    }

    function formatDate(ts) {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return ''; }
    }

    // Aggregate stats
    var reviews = state.reviews;
    var count = reviews.length;
    var avg = count ? (reviews.reduce(function (sum, r) { return sum + (r.rating || 0); }, 0) / count) : 0;
    var roundedAvg = Math.round(avg);

    // Star distribution (5 → 1)
    var dist = [5, 4, 3, 2, 1].map(function (star) {
        var c = reviews.filter(function (r) { return Math.round(r.rating) === star; }).length;
        return { star: star, count: c, pct: count ? Math.round((c / count) * 100) : 0 };
    });

    var isSignedIn = !!user;

    return createElement('div', { className: 'glass-card reviews-container' },
        // Header
        createElement('div', { className: 'reviews-header' },
            createElement('div', null,
                createElement('h2', { className: 'section-title', style: { margin: 0 } }, '💬 ' + t('Reviews & Ratings', appLang)),
                createElement('p', { className: 'section-desc', style: { margin: '4px 0 0' } }, t('See what learners think — and share your own experience.', appLang))
            ),
            createElement('button', {
                className: 'btn btn--outline',
                onClick: loadReviews,
                disabled: state.loading
            }, state.loading ? '↻ ' + t('Loading…', appLang) : '↻ ' + t('Refresh', appLang))
        ),

        // Summary
        createElement('div', { className: 'reviews-summary' },
            createElement('div', { className: 'reviews-summary__score' },
                createElement('div', { className: 'reviews-summary__avg' }, count ? avg.toFixed(1) : '—'),
                createElement(StarRating, { value: roundedAvg, size: '1.1rem' }),
                createElement('div', { className: 'reviews-summary__count' },
                    count ? (count + ' ' + t(count === 1 ? 'review' : 'reviews', appLang)) : t('No reviews yet', appLang))
            ),
            createElement('div', { className: 'reviews-summary__bars' },
                dist.map(function (d) {
                    return createElement('div', { key: d.star, className: 'review-bar' },
                        createElement('span', { className: 'review-bar__label' }, d.star + '★'),
                        createElement('div', { className: 'review-bar__track' },
                            createElement('div', { className: 'review-bar__fill', style: { width: d.pct + '%' } })
                        ),
                        createElement('span', { className: 'review-bar__count' }, d.count)
                    );
                })
            )
        ),

        // Write a review
        createElement('div', { className: 'review-form' },
            createElement('h3', { className: 'review-form__title' }, t('Write a review', appLang)),
            isSignedIn
                ? createElement('div', null,
                    createElement('div', { className: 'review-form__rate-row' },
                        createElement('span', { className: 'review-form__rate-label' }, t('Your rating', appLang) + ':'),
                        createElement(StarRating, { value: rating, onRate: setRating, size: '1.8rem' })
                    ),
                    createElement('textarea', {
                        className: 'input-field review-form__textarea',
                        placeholder: t('Share your thoughts about JLPT Master (optional)…', appLang),
                        value: text,
                        maxLength: 1000,
                        onChange: function (e) { setText(e.target.value); }
                    }),
                    createElement('div', { className: 'review-form__actions' },
                        createElement('span', { className: 'review-form__counter' }, text.length + '/1000'),
                        createElement('button', {
                            className: 'btn btn--primary',
                            onClick: submit,
                            disabled: submitting || !rating
                        }, submitting ? t('Submitting…', appLang) : t('Submit Review', appLang))
                    )
                )
                : createElement('div', { className: 'review-form__signin' },
                    createElement('p', { style: { margin: '0 0 14px', color: 'var(--text-secondary)' } },
                        t('Sign in to leave a review.', appLang)),
                    createElement('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
                        createElement('button', {
                            className: 'btn btn--primary',
                            onClick: handleGoogleLogin,
                            style: { background: '#4285F4', color: '#fff', border: 'none' }
                        }, t('Sign in with Google', appLang)),
                        createElement('button', { className: 'btn btn--outline', onClick: handleGuestLogin },
                            t('Continue as Guest', appLang))
                    )
                ),
            notice ? createElement('div', {
                className: 'review-notice review-notice--' + notice.type
            }, notice.msg) : null
        ),

        // Error / loading / list
        state.error ? createElement('div', { className: 'review-empty', style: { color: 'var(--accent-red)' } },
            t('Could not load reviews:', appLang) + ' ' + state.error) : null,

        state.loading && count === 0
            ? createElement('div', { className: 'review-empty' }, t('Loading reviews…', appLang))
            : null,

        !state.loading && count === 0 && !state.error
            ? createElement('div', { className: 'review-empty' },
                createElement('div', { style: { fontSize: '2.5rem', marginBottom: '8px' } }, '🌸'),
                t('No reviews yet — be the first to leave one!', appLang))
            : null,

        count > 0 ? createElement('div', { className: 'review-list' },
            reviews.map(function (r) {
                return createElement('div', { key: r.id, className: 'review-card' },
                    createElement('div', { className: 'review-card__head' },
                        createElement('div', { className: 'review-avatar' }, renderAvatar(r.avatar)),
                        createElement('div', { className: 'review-card__meta' },
                            createElement('div', { className: 'review-card__name' }, r.name),
                            createElement('div', { className: 'review-card__sub' },
                                createElement(StarRating, { value: r.rating, size: '0.95rem' }),
                                createElement('span', { className: 'review-card__date' }, formatDate(r.createdAt))
                            )
                        )
                    ),
                    r.text ? createElement('p', { className: 'review-card__text' }, r.text) : null
                );
            })
        ) : null
    );
}

export { ReviewsTab, StarRating };
