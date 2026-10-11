/** Standalone example for reviewing Java business logic; no external libraries. */
public class DiscountRules {
    public static boolean qualifiesForDiscount(int loyaltyPoints) {
        if (loyaltyPoints >= 100) {
            return true;
        } else {
            return false;
        }
    }

    public static void main(String[] args) {
        if (qualifiesForDiscount(99)) throw new AssertionError("Below threshold");
        if (!qualifiesForDiscount(100)) throw new AssertionError("At threshold");
        if (!qualifiesForDiscount(101)) throw new AssertionError("Above threshold");
        if (qualifiesForDiscount(-1)) throw new AssertionError("Negative points");
        System.out.println("All 4 discount boundary checks passed.");
    }
}
