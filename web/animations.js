import gsap from 'gsap';

export const Animations = {
    // Reveal animation for file cards
    animateEntry(element) {
        gsap.fromTo(element,
            { opacity: 0, y: 20, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.7)" }
        );
    },

    // Success pulse effect
    animateSuccess(element) {
        gsap.to(element, {
            boxShadow: "0 0 20px var(--accent-primary)",
            scale: 1.05,
            duration: 0.2,
            yoyo: true,
            repeat: 1
        });
    },

    // Button loading state
    animateButtonLoading(btn, isLoading) {
        if (isLoading) {
            gsap.to(btn, { width: 60, color: "transparent", duration: 0.3 });
        } else {
            gsap.to(btn, { width: "auto", color: "white", duration: 0.3 });
        }
    }
};
