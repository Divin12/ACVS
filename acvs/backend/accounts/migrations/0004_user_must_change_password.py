# Adds User.must_change_password for the staff-invite forced-change flow
# (tier 4, this round).
#
# Default is False. Existing rows (seed_demo, anyone created before
# this migration) stay False, so the existing login paths are
# unaffected. The flag is only set true by the StaffInviteView at the
# moment a new user is created.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_user_last_login_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
    ]
