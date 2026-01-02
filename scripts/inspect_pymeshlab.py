
import pymeshlab
print("Attributes in pymeshlab:")
for attr in dir(pymeshlab):
    if "Percent" in attr or "Absolute" in attr:
        print(f"Found: {attr}")
        
# Also try to print all to see if I missed something obvious
print("-" * 20)
print(dir(pymeshlab))
