import asyncio
import uuid
from datetime import datetime
from backend.db import subjects_collection, init_db, users_collection

async def seed_data():
    await init_db()
    
    # 1. Handle Duplicates for "Artificial Intelligence"
    # Keep oldest, delete others
    ai_subjects = await subjects_collection.find({"subject_name": "Artificial Intelligence"}).sort("created_at", 1).to_list(length=100)
    if len(ai_subjects) > 1:
        keep_id = ai_subjects[0]["_id"]
        to_delete = [s["_id"] for s in ai_subjects[1:]]
        await subjects_collection.delete_many({"_id": {"$in": to_delete}})
        print(f"Deleted {len(to_delete)} duplicate AI subjects.")

    # 2. Master Data Definitions
    faculty_id = "FAC001"
    faculty_name = "Dr. Ravi Kumar"
    academic_year = "2025-2026"

    subjects_to_insert = [
        # MCA 1st Year
        {
            "subject_id": str(uuid.uuid4()),
            "subject_name": "Programming Fundamentals",
            "department": "MCA",
            "year": "1st Year",
            "semester": "Semester 1",
            "section": "A",
            "academic_year": academic_year,
            "faculty_id": faculty_id,
            "faculty_name": faculty_name,
            "schedule": [
                {"day": "Monday", "start": "09:00", "end": "10:00", "room": "Room-101"},
                {"day": "Wednesday", "start": "10:00", "end": "11:00", "room": "Room-101"}
            ],
            "created_at": datetime.utcnow()
        },
        {
            "subject_id": str(uuid.uuid4()),
            "subject_name": "Database Systems",
            "department": "MCA",
            "year": "1st Year",
            "semester": "Semester 1",
            "section": "A",
            "academic_year": academic_year,
            "faculty_id": faculty_id,
            "faculty_name": faculty_name,
            "schedule": [
                {"day": "Tuesday", "start": "11:15", "end": "12:15", "room": "Room-204"},
                {"day": "Thursday", "start": "09:00", "end": "10:00", "room": "Room-204"}
            ],
            "created_at": datetime.utcnow()
        },
        # MCA 2nd Year
        {
            "subject_name": "Artificial Intelligence", # Check if exists before insert
            "department": "MCA",
            "year": "2nd Year",
            "semester": "Semester 3",
            "section": "A",
            "academic_year": academic_year,
            "faculty_id": faculty_id,
            "faculty_name": faculty_name,
            "schedule": [
                {"day": "Monday", "start": "11:15", "end": "12:15", "room": "Lab-1"},
                {"day": "Thursday", "start": "10:00", "end": "11:00", "room": "Lab-1"}
            ],
            "created_at": datetime.utcnow()
        },
        {
            "subject_id": str(uuid.uuid4()),
            "subject_name": "Cloud Computing",
            "department": "MCA",
            "year": "2nd Year",
            "semester": "Semester 3",
            "section": "A",
            "academic_year": academic_year,
            "faculty_id": faculty_id,
            "faculty_name": faculty_name,
            "schedule": [
                {"day": "Tuesday", "start": "09:00", "end": "10:00", "room": "Cloud-Lab"},
                {"day": "Friday", "start": "11:15", "end": "12:15", "room": "Cloud-Lab"}
            ],
            "created_at": datetime.utcnow()
        },
        # CSE 3rd Year
        {
            "subject_id": str(uuid.uuid4()),
            "subject_name": "Machine Learning",
            "department": "CSE",
            "year": "3rd Year",
            "semester": "Semester 5",
            "section": "B",
            "academic_year": academic_year,
            "faculty_id": faculty_id,
            "faculty_name": faculty_name,
            "schedule": [
                {"day": "Wednesday", "start": "13:00", "end": "14:00", "room": "Lab-2"},
                {"day": "Friday", "start": "09:00", "end": "10:00", "room": "Lab-2"}
            ],
            "created_at": datetime.utcnow()
        },
        {
            "subject_id": str(uuid.uuid4()),
            "subject_name": "Data Mining",
            "department": "CSE",
            "year": "3rd Year",
            "semester": "Semester 5",
            "section": "B",
            "academic_year": academic_year,
            "faculty_id": faculty_id,
            "faculty_name": faculty_name,
            "schedule": [
                {"day": "Tuesday", "start": "13:00", "end": "14:00", "room": "Room-305"},
                {"day": "Thursday", "start": "13:00", "end": "14:00", "room": "Room-305"}
            ],
            "created_at": datetime.utcnow()
        }
    ]

    for subj in subjects_to_insert:
        # Check if exists
        query = {
            "subject_name": subj["subject_name"],
            "department": subj["department"],
            "year": subj["year"],
            "section": subj["section"],
            "academic_year": subj["academic_year"]
        }
        existing = await subjects_collection.find_one(query)
        if existing:
            print(f"Subject {subj['subject_name']} already exists. Updating schedule...")
            await subjects_collection.update_one(query, {"$set": {"schedule": subj["schedule"], "faculty_id": subj["faculty_id"], "faculty_name": subj["faculty_name"]}})
        else:
            if "subject_id" not in subj:
                subj["subject_id"] = str(uuid.uuid4())
            await subjects_collection.insert_one(subj)
            print(f"Inserted subject: {subj['subject_name']}")

    # 3. Ensure Faculty User Exists (Optional but good for testing)
    test_faculty = await users_collection.find_one({"email": "ravi@example.com"})
    if not test_faculty:
         # Simplified user doc
         await users_collection.insert_one({
             "email": "ravi@example.com",
             "full_name": "Dr. Ravi Kumar",
             "role": "teacher",
             "faculty_id": "FAC001",
             "created_at": datetime.utcnow()
         })
         print("Created test faculty user.")

if __name__ == "__main__":
    asyncio.run(seed_data())
