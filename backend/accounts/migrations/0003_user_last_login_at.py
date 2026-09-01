# Adds User.last_login_at for the staff-list endpoint (tier 4, §4).
#
# Nullable DateTimeField; legacy rows leave it NULL until the next
# successful OTP verification stamps it. No default value at the DB
# level — Django will store NULL for existing rows automatically
# when the column is added without a default.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_loginotp"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="last_login_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
